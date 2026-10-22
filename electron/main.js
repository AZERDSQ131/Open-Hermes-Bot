// This file is the Hermes bridge. The app is an interface, not a harness:
// Hermes runs the agent, keeps the memory and calls the models, and
// everything below only carries a turn to it and hands back what it says.
// docs/architecture.md says where the boundary runs.

const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const { createUpdater } = require('./updater');
const {
  apiBaseUrl,
  apiUrl,
  connectionLabel,
  isConfigured,
  normalizeMode,
  resolveMode,
  sshConfigHosts,
} = require('./connection.js');
const { createMarkReader } = require('./logos.js');

app.setName('Hermes Bot');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// The app finds its own next version on the releases page, the way every
// other app does. The update waits for the person to close the app: a
// conversation is not something to interrupt. A person who asks for it gets
// it there and then: looked for, downloaded, and the app comes back as the
// version that was found.
const updater = createUpdater({
  app,
  autoUpdater,
  onEvent: (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('hermes:update:event', event);
    }
  },
});

// The live tunnel forwards a configurable local port; a connection test uses
// a neighbouring port on a throwaway tunnel that is never persisted.
//
// A tunnel is only for a Hermes that runs somewhere else. When it runs on
// this machine the app talks to the port itself, and nothing is forwarded.
const TUNNEL_TIMEOUT_MS = 15000;
const DEFAULT_CONNECTION = {
  // No host is a name: the machine running Hermes is the person's to say.
  // The ports are Hermes' own defaults.
  sshHost: '',
  apiPort: 8642,
  localPort: 18742,
  // A stored key is an intent to be connected: starting disconnected only
  // produced "not connected" on the first message. Settings can opt out.
  autoConnect: true,
};

let connectionStatus = { state: 'disconnected' };
// The tunnel exists only for a Hermes that runs somewhere else.
let tunnel = null;
let tunnelError = '';
// The port Hermes answers on when it runs on this machine.
let directPort = 0;
// The person asked to stay offline. The app reconnects on its own for every
// request that needs Hermes, so a disconnect has to be a promise the app
// keeps until the person asks for the connection again.
let manualDisconnect = false;

function settingsPath() {
  return path.join(app.getPath('userData'), 'hermes-connection.json');
}

function tunnelPidPath() {
  return path.join(app.getPath('userData'), 'hermes-tunnel.pid');
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

// The record as it is written down. The mode lives here, and only here: it
// is the answer to "where does Hermes run?", and it is the one thing the
// app keeps about its own connection.
function storedRecord() {
  const store = readStore();
  return store.connection || {};
}

function storedConnection() {
  const record = storedRecord();
  return {
    ...DEFAULT_CONNECTION,
    ...record,
    // A record written before the modes existed still means what it meant:
    // a host is a machine somewhere else.
    mode: resolveMode(record),
  };
}

// The setup is a door the person walks through once. The app remembers that
// they did — that is not a conversation, and it does not belong to Hermes:
// the host may not even be reachable yet when the answer is needed.
function storedOnboarding() {
  const store = readStore();
  const onboarding = store.onboarding || {};
  return {
    completed: Boolean(onboarding.completed),
    completedAt: onboarding.completedAt ?? null,
  };
}

// The Hermes API key lives in the login Keychain, under this app's own
// service. safeStorage would name the item after the app, which turns every
// read into a Keychain prompt. The `security` tool writes an item it can read
// back without a prompt, so the key stays in the Keychain and belongs to
// nobody else.
const KEYCHAIN_SERVICE = 'Hermes Bot';
const KEYCHAIN_ACCOUNT = 'Hermes API key';

function security(args) {
  try {
    return execFileSync('/usr/bin/security', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function storeSecret(value) {
  const secret = String(value ?? '').trim();
  if (!secret) return false;
  try {
    execFileSync(
      '/usr/bin/security',
      [
        'add-generic-password',
        '-U',
        '-a',
        KEYCHAIN_ACCOUNT,
        '-s',
        KEYCHAIN_SERVICE,
        '-w',
        secret,
      ],
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

function readSecret() {
  return security([
    'find-generic-password',
    '-a',
    KEYCHAIN_ACCOUNT,
    '-s',
    KEYCHAIN_SERVICE,
    '-w',
  ]).trim();
}

function clearSecret() {
  security([
    'delete-generic-password',
    '-a',
    KEYCHAIN_ACCOUNT,
    '-s',
    KEYCHAIN_SERVICE,
  ]);
}

function storedApiKey() {
  return readSecret();
}

function publicSettings() {
  const connection = storedConnection();
  return {
    mode: connection.mode,
    configured: isConfigured(storedRecord()),
    sshHost: connection.sshHost,
    apiPort: connection.apiPort,
    localPort: connection.localPort,
    autoConnect: Boolean(connection.autoConnect),
    hasKey: Boolean(storedApiKey()),
    onboardingCompleted: storedOnboarding().completed,
  };
}

// The live tunnel owns `localPort`; the probe uses the next free slot so a
// connection test never collides with a tunnel that is already running.
function testPortFor(localPort) {
  return localPort >= 65535 ? localPort - 1 : localPort + 1;
}

// A port can be held by a forward nobody reaped: an ssh that outlived the app
// keeps the local port, and the tunnel cannot bind. The next free port is
// then the one to use — the setting stays the preference, the app just works
// around what is in the way.
const PORT_ATTEMPTS = 5;

function portAfter(localPort, attempt) {
  const port = localPort + attempt;
  return port > 65535 ? localPort - attempt : port;
}

function portIsBusy(message) {
  return /address already in use|cannot listen to port|bind: /i.test(
    String(message ?? ''),
  );
}

function setStatus(next) {
  connectionStatus = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('hermes:status', next);
  }
  return next;
}

function sanitizeHost(value) {
  const host = String(value ?? '').trim();
  if (!host || host.length > 128) return null;
  return /^[A-Za-z0-9._@:-]+$/.test(host) ? host : null;
}

function sanitizePort(value) {
  const port = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

function killTunnel(state) {
  if (!state?.child) return;
  try {
    state.child.removeAllListeners('exit');
    state.child.kill('SIGTERM');
  } catch {
    // The process is already gone.
  }
}

function stopTunnel() {
  killTunnel(tunnel);
  tunnel = null;
  tunnelError = '';
  try {
    fs.rmSync(tunnelPidPath(), { force: true });
  } catch {
    // The PID file is best-effort cleanup.
  }
}

// A hard kill (SIGKILL, crashed process) skips stopTunnel and would leave the
// ssh child holding the local port. Reap it from the PID file on next start.
function reapOrphanTunnel() {
  const file = tunnelPidPath();
  let pid = 0;
  try {
    pid = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
  } catch {
    return;
  }
  if (Number.isInteger(pid) && pid > 0) {
    try {
      const probe = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
      });
      const command = (probe.stdout || '').trim();
      const isOurTunnel =
        command.includes('ssh') && /-L 127\.0\.0\.1:\d+:/.test(command);
      if (isOurTunnel) process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone: nothing to reap.
    }
  }
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Ignore cleanup failures.
  }
}

function spawnTunnel(connection, localPort) {
  const args = [
    '-o',
    'BatchMode=yes',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'ServerAliveInterval=30',
    '-N',
    '-L',
    `127.0.0.1:${localPort}:127.0.0.1:${connection.apiPort}`,
    connection.sshHost,
  ];
  const state = { child: null, stderr: '', localPort, dead: false, error: '' };
  const child = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  state.child = child;
  child.stderr.on('data', (chunk) => {
    state.stderr = `${state.stderr}${chunk.toString()}`.slice(-2000);
    tunnelError = state.stderr.trim();
  });
  child.on('error', (error) => {
    state.dead = true;
    state.error = error.message;
    tunnelError = error.message;
  });
  child.on('exit', () => {
    state.dead = true;
    if (tunnel === state) tunnel = null;
  });
  return state;
}

function startLiveTunnel(connection) {
  stopTunnel();
  const state = spawnTunnel(connection, connection.localPort);
  tunnel = state;
  try {
    fs.writeFileSync(tunnelPidPath(), String(state.child.pid), { mode: 0o600 });
  } catch {
    // The PID file is only used to reap orphans.
  }
  return state;
}

async function probeHealth(apiKey, localPort) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(
      `http://127.0.0.1:${localPort}/health/detailed`,
      {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: controller.signal,
      },
    );
    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? await response.json() : null,
    };
  } catch (error) {
    // "fetch failed" says nothing a person can act on. A refused connection
    // means one thing: nothing is listening on that port.
    const code = error?.cause?.code ?? '';
    return {
      ok: false,
      status: 0,
      error:
        code === 'ECONNREFUSED'
          ? 'Nothing is listening on that port'
          : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForTunnel(state, apiKey) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < TUNNEL_TIMEOUT_MS) {
    if (!state || state.dead) {
      return {
        ok: false,
        status: 0,
        error:
          state?.error ||
          String(state?.stderr ?? '').trim() ||
          tunnelError ||
          'SSH tunnel closed',
      };
    }
    last = await probeHealth(apiKey, state.localPort);
    if (last.ok || last.status === 401) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return last ?? { ok: false, status: 0, error: 'Tunnel timeout' };
}

// A Hermes on this machine has no tunnel to wait for: the port is either
// answering or it is not. It still gets a moment — a server that is just
// starting answers a second later, and the person did not ask to be told it
// was down while it was coming up.
async function waitForLocal(apiPort, apiKey, timeoutMs = TUNNEL_TIMEOUT_MS) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await probeHealth(apiKey, apiPort);
    if (last.ok || last.status === 401) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return last ?? { ok: false, status: 0, error: 'No answer on the local port' };
}

function statusFromProbe(probe, connection) {
  const mode = connection?.mode === 'local' ? 'local' : 'ssh';
  const label = connectionLabel(mode, connection?.sshHost);
  if (probe.ok) {
    const body = probe.body ?? {};
    return {
      state: 'connected',
      version: body.version,
      platform: body.platform,
      gateway: body.gateway_state,
      mode,
      label,
      sshHost: mode === 'ssh' ? connection.sshHost : '',
    };
  }
  if (probe.status === 401) {
    return {
      state: 'error',
      message: 'API key rejected by the Hermes API server',
      mode,
      label,
    };
  }
  return {
    state: 'error',
    message: probe.error || tunnelError || `HTTP ${probe.status || '?'}`,
    mode,
    label,
  };
}

// A GUI app inherits almost nothing of the shell: the PATH it is launched
// with is short, and the tools Hermes' own scripts need — python3, openssl —
// live in the places a person installs them. The usual ones are added back,
// so a command run here finds what it expects.
const LOCAL_PATH = [
  process.env.PATH || '',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
].join(':');

// A command, wherever it runs. The bytes of a file the person attached go
// down the pipe the command reads, never through a command line.
function runProcess(command, args, timeoutMs, input, timeoutMessage, options) {
  const maxStdout = options?.maxStdout ?? 8000;
  const maxStderr = options?.maxStderr ?? 2000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: LOCAL_PATH },
    });
    let stdout = '';
    let stderr = '';
    if (input && child.stdin) {
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: timeoutMessage });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.slice(0, maxStdout),
        stderr: stderr.slice(0, maxStderr),
      });
    });
  });
}

function runSsh(host, command, timeoutMs = 20000, input, options) {
  // No host is a name: there is nothing to reach.
  if (!String(host ?? '').trim()) {
    return Promise.resolve({
      ok: false,
      error:
        'No host configured — open Settings to say where Hermes runs.',
    });
  }
  return runProcess(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
    timeoutMs,
    input,
    'SSH command timed out',
    options,
  );
}

// The same command, on this machine. The scripts are the same, the paths are
// the same: a Hermes that runs here keeps its home in the same place.
function runLocalCommand(command, timeoutMs = 20000, input, options) {
  return runProcess(
    '/bin/bash',
    ['-c', command],
    timeoutMs,
    input,
    'Command timed out',
    options,
  );
}

// A command on the machine that runs Hermes. On another machine it rides the
// SSH connection; on this one it is run here. Everything above this line
// asks for a command, not for a way to reach one.
function runHostCommand(connection, command, timeoutMs = 20000, input, options) {
  if (connection?.mode === 'local') {
    return runLocalCommand(command, timeoutMs, input, options);
  }
  return runSsh(connection?.sshHost, command, timeoutMs, input, options);
}

/**
 * The stderr of a command that never ran is nothing: the host may not even be
 * known yet, and the tunnel may have died before writing a word. Reading it
 * must not throw — an error the person can read is worth more than an
 * exception nobody sees.
 */
function stderrOf(result) {
  return String(result?.stderr ?? '').trim();
}

function parseEnvValue(raw) {
  let value = String(raw ?? '').split('\n')[0].trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  if (quoted) value = value.slice(1, -1);
  return value.trim();
}

ipcMain.handle('hermes:settings:get', () => publicSettings());

ipcMain.handle('hermes:settings:save', (_event, payload) => {
  const current = storedConnection();
  // Where Hermes runs. A record that does not say keeps the mode it had.
  const mode = payload?.mode ? normalizeMode(payload.mode) : current.mode;
  const port = sanitizePort(payload?.apiPort);
  if (!port) return { ok: false, error: 'Invalid API port' };

  // A host is a name, and a name is only needed for a machine elsewhere.
  const host =
    mode === 'local'
      ? sanitizeHost(payload?.sshHost) ?? current.sshHost
      : sanitizeHost(payload?.sshHost);
  if (mode === 'ssh' && !host) {
    return { ok: false, error: 'Invalid SSH host' };
  }

  const localPort =
    payload?.localPort === undefined
      ? current.localPort
      : sanitizePort(payload.localPort);
  if (!localPort) return { ok: false, error: 'Invalid local tunnel port' };
  // The tunnel forwards a port to a port: they cannot be the same one. A
  // Hermes on this machine has no tunnel, and no such rule.
  if (mode === 'ssh' && localPort === port) {
    return { ok: false, error: 'Local and remote ports must differ' };
  }
  const autoConnect =
    payload?.autoConnect === undefined
      ? Boolean(current.autoConnect)
      : Boolean(payload.autoConnect);

  if (payload?.clearKey) clearSecret();
  if (typeof payload?.apiKey === 'string' && payload.apiKey.trim()) {
    storeSecret(payload.apiKey.trim());
  }

  // The store holds more than the connection: what the person already went
  // through stays where it is.
  writeStore({
    ...readStore(),
    connection: {
      mode,
      sshHost: host ?? '',
      apiPort: port,
      localPort,
      autoConnect,
    },
  });
  return { ok: true, settings: publicSettings() };
});

// The setup is remembered so the app stops asking. It can be opened again by
// hand, from the settings, and then this flag is the only thing that changes.
ipcMain.handle('hermes:onboarding:set', (_event, payload) => {
  const completed = Boolean(payload?.completed);
  const store = readStore();
  writeStore({
    ...store,
    onboarding: {
      ...(store.onboarding || {}),
      completed,
      completedAt: completed ? new Date().toISOString() : null,
    },
  });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('hermes:key:import', async (_event, payload) => {
  const current = storedConnection();
  const mode = payload?.mode ? normalizeMode(payload.mode) : current.mode;
  const host = sanitizeHost(payload?.sshHost) || current.sshHost;
  // The key sits in the same place either way: the Hermes home of the
  // machine that runs it.
  const result = await runHostCommand(
    { mode, sshHost: host },
    'grep -m1 -E \'^API_SERVER_KEY=\' "$HOME/.hermes/.env" 2>/dev/null | cut -d= -f2-',
  );
  if (!result.ok || !result.stdout.trim()) {
    return {
      ok: false,
      error:
        result.error ||
        stderrOf(result) ||
        'API_SERVER_KEY not found in ~/.hermes/.env',
    };
  }
  const key = parseEnvValue(result.stdout);
  if (key.length < 16) return { ok: false, error: 'Imported key looks invalid' };
  storeSecret(key);
  return { ok: true, keyLength: key.length };
});

// The persons' machines have names they have already written once. Reading
// them is a courtesy the setup lives on: a missing file says an empty list,
// and nothing is asked of the SSH itself — it is a text file.
ipcMain.handle('hermes:ssh:hosts', () => {
  try {
    const config = fs.readFileSync(
      path.join(os.homedir(), '.ssh', 'config'),
      'utf8',
    );
    return { ok: true, hosts: sshConfigHosts(config) };
  } catch {
    return { ok: true, hosts: [] };
  }
});

async function connectNow() {
  const connection = storedConnection();
  const apiKey = storedApiKey();
  if (connection.mode === 'ssh' && !connection.sshHost) {
    return setStatus({
      state: 'error',
      message: 'No host configured — open Settings to say where Hermes runs.',
    });
  }
  if (!apiKey) {
    return setStatus({ state: 'error', message: 'No API key configured' });
  }
  // Asking to connect is asking for the connection back.
  manualDisconnect = false;

  setStatus({ state: 'connecting' });

  // One link at a time: the mode says which one it is, and the other is
  // closed rather than left to rot.
  directPort = 0;

  // A Hermes on this machine: the port is the connection. There is no
  // forward to open, and no orphan to reap.
  if (connection.mode === 'local') {
    stopTunnel();
    const probe = await waitForLocal(connection.apiPort, apiKey);
    if (probe.ok) directPort = connection.apiPort;
    return setStatus(statusFromProbe(probe, connection));
  }

  // The orphan comes first: the PID file is what says which ssh to reap, and
  // closing the live tunnel would take that file with it.
  reapOrphanTunnel();
  let probe = null;
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
    const localPort =
      attempt === 0 ? connection.localPort : portAfter(connection.localPort, attempt);
    const state = startLiveTunnel({ ...connection, localPort });
    probe = await waitForTunnel(state, apiKey);
    if (probe.ok || probe.status === 401) break;
    // Something else answers on that port, or the tunnel could not bind: the
    // next free port is the one to use.
    const taken =
      portIsBusy(probe.error) ||
      (probe.status >= 400 && probe.status < 500) ||
      Boolean(state?.dead);
    if (!taken) break;
  }
  return setStatus(statusFromProbe(probe, connection));
}

ipcMain.handle('hermes:connect', () => connectNow());

// Probe unsaved values: nothing is persisted and an already-connected app
// keeps its own tunnel untouched.
ipcMain.handle('hermes:test', async (_event, payload) => {
  const current = storedConnection();
  const mode = payload?.mode ? normalizeMode(payload.mode) : current.mode;
  const port = sanitizePort(payload?.apiPort);
  if (!port) return { state: 'error', message: 'Invalid API port' };
  const typedKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
  const apiKey = typedKey || storedApiKey();
  if (!apiKey) {
    return { state: 'error', message: 'Enter the API key or import it first' };
  }
  const connection = { ...current, mode, apiPort: port };

  // A Hermes on this machine is tested on the port itself: there is no
  // throwaway tunnel to open, and nothing to close afterwards.
  if (mode === 'local') {
    const probe = await waitForLocal(port, apiKey, 5000);
    return statusFromProbe(probe, connection);
  }

  const host = sanitizeHost(payload?.sshHost);
  if (!host) return { state: 'error', message: 'Invalid SSH host' };
  const ephemeral = spawnTunnel(
    { sshHost: host, apiPort: port },
    testPortFor(current.localPort),
  );
  try {
    const probe = await waitForTunnel(ephemeral, apiKey);
    return statusFromProbe(probe, { ...connection, sshHost: host });
  } finally {
    killTunnel(ephemeral);
  }
});

ipcMain.handle('hermes:disconnect', () => {
  manualDisconnect = true;
  stopTunnel();
  directPort = 0;
  return setStatus({ state: 'disconnected' });
});

ipcMain.handle('hermes:status', () => connectionStatus);

// ----------------------------------------------------------------- update

// The version the app is running, and whether it has a way of finding the
// next one: a copy running from the sources has no releases page.
ipcMain.handle('hermes:update:info', () => updater.info());

// A person asks for an update: it is looked for, downloaded, and the app
// comes back as the version that was found.
ipcMain.handle('hermes:update:check', () => updater.check());

// Where the look stands: the mark in the sidebar reads it when it opens, so
// the scan the app started on its own is seen from the first word.
ipcMain.handle('hermes:update:state', () => updater.status());

// The new version takes over: the app closes and comes back as itself.
ipcMain.handle('hermes:update:install', () => ({ ok: updater.install() }));

// Where the releases live, the way the record of the app says it: the same
// record the updater reads for its feed (app-update.yml, beside the
// bundle's own resources). A copy that runs from the sources has no such
// record, and then the person reads why instead of a list.
const GITHUB = (() => {
  try {
    const note = fs.readFileSync(
      path.join(process.resourcesPath, 'app-update.yml'),
      'utf8',
    );
    const owner = /^owner:\s*(\S+)/m.exec(note)?.[1];
    const repo = /^repo:\s*(\S+)/m.exec(note)?.[1];
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
})();
const RELEASES_URL = GITHUB
  ? `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/releases?per_page=12`
  : '';

// What GitHub has put on the page of the project: the history the look for
// an update reads its latest line from. The shell asks, because the screen
// touches no network of its own. A page that says nothing, or says no, is
// not an error the person carries: the app still works.
ipcMain.handle('hermes:update:history', async () => {
  if (!RELEASES_URL) {
    return {
      ok: false,
      rows: [],
      message: 'Where the releases live is not something the package says.',
    };
  }
  try {
    const answer = await fetch(RELEASES_URL, {
      headers: { 'User-Agent': 'Hermes-Bot', Accept: 'application/vnd.github+json' },
    });
    if (!answer.ok) {
      throw new Error(`GitHub answered ${answer.status} to the ask for the history.`);
    }
    return {
      ok: true,
      rows: await answer.json(),
      page: GITHUB
        ? `https://github.com/${GITHUB.owner}/${GITHUB.repo}/releases`
        : '',
    };
  } catch (error) {
    return { ok: false, rows: [], message: error?.message ?? String(error) };
  }
});

// A row of the history opens where its release lives. The shell is the one
// allowed to hand an address to the Mac, and only to a page of this
// project's own releases.
ipcMain.handle('hermes:update:open-release', (_event, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) {
    return Promise.resolve({ ok: false });
  }
  return shell
    .openExternal(url)
    .then(() => ({ ok: true }), () => ({ ok: false }));
});

// ------------------------------------------------------------ capabilities

// What the host can reach: the skills, the tools, and the services of the
// account.
//
// None of it is on the API the app talks to: that API answers the agent's own
// questions, and these are the host's own. So the shell runs a script on the
// machine that runs Hermes, with the Python that runs Hermes — the system one
// is too old for its modules and has none of their dependencies.
//
// The script is run through Hermes' own bootstrap, which is what leases those
// dependencies. A script that skipped it would answer "there is nothing here"
// for everything.
const CAPABILITIES_PYTHON = `import json
import os
import pathlib
import sys

root = pathlib.Path(os.path.expanduser("~/.hermes"))
sys.path.insert(0, str(root / "hermes-agent"))

WHAT = os.environ.get("HERMES_BOT_WHAT", "skills")
PROFILE = (os.environ.get("HERMES_BOT_PROFILE") or "").strip()
VALUE = (os.environ.get("HERMES_BOT_VALUE") or "").strip()
ENABLED = (os.environ.get("HERMES_BOT_ENABLED") or "").strip() == "1"


def answer(payload):
    print(json.dumps(payload, separators=(",", ":"), default=str))
    raise SystemExit(0)


def rows(items):
    return list(items) if isinstance(items, (list, tuple)) else []


try:
    from hermes_cli.web_server_profiles import _profile_scope
except Exception as exc:
    answer({"ok": False, "error": "Hermes' own modules are not here: %r" % (exc,)})


def scoped(fn):
    """Run inside the scope of the profile that was asked for."""
    with _profile_scope(PROFILE or None):
        return fn()


# ------------------------------------------------------------------- skills

def skills_of():
    from hermes_cli.config import load_config
    from hermes_cli.skills_config import get_disabled_skills
    from tools.skill_usage import _read_bundled_names, _read_hub_installed_names
    from tools.skills_tool import _find_all_skills

    config = load_config()
    disabled = get_disabled_skills(config)
    bundled = _read_bundled_names()
    hub = _read_hub_installed_names()
    out = []
    for skill in _find_all_skills(skip_disabled=True):
        name = str(skill.get("name") or "")
        if not name:
            continue
        out.append({
            "name": name,
            "description": str(skill.get("description") or ""),
            "enabled": name not in disabled,
            "provenance": "hub" if name in hub else ("bundled" if name in bundled else "agent"),
        })
    return out


def skill_toggle():
    from hermes_cli.config import load_config
    from hermes_cli.skills_config import get_disabled_skills, save_disabled_skills

    config = load_config()
    disabled = get_disabled_skills(config)
    if ENABLED:
        disabled.discard(VALUE)
    else:
        disabled.add(VALUE)
    save_disabled_skills(config, disabled)
    return {"ok": True, "name": VALUE, "enabled": ENABLED}


# --------------------------------------------------------------------- tools

def toolsets_of():
    from hermes_cli.config import load_config
    from hermes_cli.tools_config import (
        _get_effective_configurable_toolsets,
        _get_platform_tools,
        _toolset_configuration_platform,
        _toolset_has_keys,
        gui_toolset_label,
    )
    from toolsets import resolve_toolset

    config = load_config()
    listed = _get_effective_configurable_toolsets()
    platforms = {_toolset_configuration_platform(name) for name, _, _ in listed}
    on = {
        platform: set(_get_platform_tools(config, platform, include_default_mcp_servers=False))
        for platform in platforms
    }
    out = []
    for name, label, description in listed:
        try:
            tools = sorted(set(resolve_toolset(name)))
        except Exception:
            tools = []
        platform = _toolset_configuration_platform(name)
        out.append({
            "name": name,
            "label": gui_toolset_label(label),
            "description": description,
            "platform": platform,
            "enabled": name in on.get(platform, set()),
            "configured": bool(_toolset_has_keys(name, config)),
            "tools": tools,
        })
    return out


def toolset_toggle():
    from hermes_cli.config import load_config, save_config
    from hermes_cli.tools_config import (
        _CONFIG_ONLY_TOOLSETS,
        _get_platform_tools,
        _save_platform_tools,
        _toolset_configuration_platform,
    )

    config = load_config()
    if VALUE in _CONFIG_ONLY_TOOLSETS:
        section = config.get(VALUE)
        if not isinstance(section, dict):
            section = {}
        section["enabled"] = ENABLED
        config[VALUE] = section
        save_config(config)
        return {"ok": True, "name": VALUE, "enabled": ENABLED}
    platform = _toolset_configuration_platform(VALUE)
    enabled = set(_get_platform_tools(config, platform, include_default_mcp_servers=False))
    if ENABLED:
        enabled.add(VALUE)
    else:
        enabled.discard(VALUE)
    _save_platform_tools(config, platform, enabled)
    return {"ok": True, "name": VALUE, "enabled": ENABLED}


# --------------------------------------------------------------- connectors

def connectors_of():
    """The services of the account: the catalogue, the toolkit, the accounts.

    Each list is read on its own: one that needs a permission the host does
    not have must not take the others down with it.
    """
    out = {"catalog": [], "toolkit": [], "accounts": [], "messages": []}

    try:
        from tools.connectors.portal.client import PortalConnectorClient

        client = PortalConnectorClient()
        client.require_authentication()
        for entry in rows(client.catalog().connectors):
            out["catalog"].append({
                "slug": str(entry.slug),
                "name": str(entry.name or entry.slug),
                "description": str(entry.description or ""),
                "category": str(entry.category or ""),
                "logo": str(entry.logo_url or ""),
            })
    except Exception as exc:
        out["messages"].append("The catalogue of the services is closed: %s" % exc)

    try:
        from tools.connectors.portal.client import PortalConnectorClient

        for account in rows(PortalConnectorClient().list_accounts()):
            out["accounts"].append({
                "connector": str(account.get("connector") or ""),
                "status": str(account.get("status") or ""),
                "label": str(account.get("label") or ""),
                "active": bool(account.get("active")),
            })
    except Exception as exc:
        out["messages"].append("The accounts of the services are closed: %s" % exc)

    try:
        from tools.connectors.managed import managed_client

        for entry in rows(managed_client().list_connectors()):
            out["toolkit"].append({
                "connector": str(entry.get("connector") or ""),
                "enabled": bool(entry.get("enabled", True)),
                "connected": bool(entry.get("connected", False)),
                "status": str(entry.get("connectionStatus") or ""),
            })
    except Exception as exc:
        out["messages"].append("The toolkit of the services is closed: %s" % exc)

    # Without Nous the three lists above stay empty, yet the host still knows
    # every service it can reach: the local catalogue names them with no
    # account at all. Those names keep the page useful before anyone signs
    # in — the Portal details fill in on top once the host is signed in.
    try:
        from tools.connectors.targets import catalog_names

        seen = {str(entry.get("slug") or "") for entry in out["catalog"]}
        for slug in list(catalog_names() or []):
            name = str(slug or "")
            if not name or name in seen:
                continue
            seen.add(name)
            out["catalog"].append({
                "slug": name, "name": "", "description": "",
                "category": "", "logo": "",
            })
            if not any(str(entry.get("connector") or "") == name for entry in out["toolkit"]):
                out["toolkit"].append({
                    "connector": name, "enabled": True,
                    "connected": False, "status": "",
                })
    except Exception:
        pass

    return out


def connector_connect():
    """The host mints the link the service wants the person to open."""
    from tools.connectors.account import find_or_start_operation, wait_for_prepare

    start = find_or_start_operation([VALUE], action="connect", profile_home=None)
    if not wait_for_prepare(start):
        answer({"ok": False, "url": "", "error": "The host could not start the connection."})
    snapshot = start.operation.snapshot()
    answer({"ok": True, "url": str(snapshot.get("connect_url") or "")})


def nous_login_start():
    """Mint a Nous device code: one click in the app, no terminal.

    Returns the verification URL and the user code. The browser opens on
    the URL; the poll below waits for the approval.
    """
    from hermes_cli.auth import PROVIDER_REGISTRY
    from hermes_cli.auth_device_flow import _request_device_code
    from hermes_cli.auth_nous import _nous_http_client

    pconfig = PROVIDER_REGISTRY["nous"]
    portal = str(pconfig.portal_base_url or "").rstrip("/")
    with _nous_http_client(15.0, True) as client:
        data = _request_device_code(
            client=client, portal_base_url=portal,
            client_id=pconfig.client_id, scope=pconfig.scope)
    return {
        "ok": True,
        "url": str(data.get("verification_uri_complete") or ""),
        "user_code": str(data.get("user_code") or ""),
        "device_code": str(data.get("device_code") or ""),
        "expires_in": int(data.get("expires_in") or 600),
        "interval": int(data.get("interval") or 5),
    }


def nous_login_poll():
    """One poll for the device code minted above.

    Pending approval answers {pending:true} so the page keeps waiting.
    Approval persists the credential like hermes auth add nous and answers
    {ok:true}. Anything else is a terminal error.
    """
    from datetime import datetime, timezone

    from hermes_cli.auth import PROVIDER_REGISTRY
    from hermes_cli.auth_constants import DEVICE_CODE_GRANT_TYPE
    from hermes_cli.auth_nous import (
        _nous_http_client, persist_nous_credentials, refresh_nous_oauth_from_state)

    device_code = VALUE.strip()
    if not device_code:
        answer({"ok": False, "pending": False, "error": "The sign-in ran out of paper: start again."})
    pconfig = PROVIDER_REGISTRY["nous"]
    portal = str(pconfig.portal_base_url or "").rstrip("/")
    with _nous_http_client(15.0, True) as client:
        response = client.post(
            f"{portal}/api/oauth/token",
            data={
                "grant_type": DEVICE_CODE_GRANT_TYPE,
                "client_id": pconfig.client_id,
                "device_code": device_code,
            })
        if response.status_code != 200:
            try:
                payload = response.json()
            except Exception:
                payload = {}
            code = str((payload or {}).get("error") or "")
            if code in ("authorization_pending", "slow_down"):
                answer({"ok": False, "pending": True})
            description = str((payload or {}).get("error_description") or code or "Sign-in failed.")
            if code in ("expired_token", "access_denied"):
                answer({"ok": False, "pending": False, "error": description})
            answer({"ok": False, "pending": code == "", "error": description})
        token_data = response.json()
    if not isinstance(token_data, dict) or not token_data.get("access_token"):
        answer({"ok": False, "pending": False, "error": "The host answered without a credential."})
    now = datetime.now(timezone.utc)
    try:
        ttl = int(token_data.get("expires_in") or 3600)
    except Exception:
        ttl = 3600
    auth_state = {
        "portal_base_url": portal,
        "inference_base_url": str(
            token_data.get("inference_base_url") or pconfig.inference_base_url or "").rstrip("/"),
        "client_id": pconfig.client_id,
        "scope": str(token_data.get("scope") or pconfig.scope or ""),
        "token_type": str(token_data.get("token_type") or "Bearer"),
        "access_token": str(token_data.get("access_token") or ""),
        "refresh_token": token_data.get("refresh_token"),
        "obtained_at": now.isoformat(),
        "expires_at": datetime.fromtimestamp(now.timestamp() + ttl, tz=timezone.utc).isoformat(),
        "expires_in": ttl,
        "tls": {"insecure": False, "ca_bundle": None},
        "agent_key": None, "agent_key_id": None, "agent_key_expires_at": None,
        "agent_key_expires_in": None, "agent_key_reused": None, "agent_key_obtained_at": None,
    }
    try:
        auth_state = refresh_nous_oauth_from_state(auth_state, timeout_seconds=15.0)
        persist_nous_credentials(auth_state)
    except Exception as exc:
        answer({"ok": False, "pending": False, "error": "%s" % (exc,)})
    answer({"ok": True, "pending": False})


# -------------------------------------------------------------------- answer

try:
    if WHAT == "skills":
        answer({"ok": True, "skills": scoped(skills_of)})
    elif WHAT == "skill-toggle":
        answer(scoped(skill_toggle))
    elif WHAT == "toolsets":
        answer({"ok": True, "toolsets": scoped(toolsets_of)})
    elif WHAT == "toolset-toggle":
        answer(scoped(toolset_toggle))
    elif WHAT == "connectors":
        answer(dict(connectors_of(), ok=True))
    elif WHAT == "connector-connect":
        connector_connect()
    elif WHAT == "nous-login-start":
        answer(nous_login_start())
    elif WHAT == "nous-login-poll":
        nous_login_poll()
    else:
        answer({"ok": False, "error": "Nothing is asked for that the host knows."})
except SystemExit:
    raise
except Exception as exc:
    answer({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)})
`;

// The Python that runs Hermes, and the bootstrap that leases its
// dependencies. The script is run through the same door Hermes itself walks
// through: the modules it imports, and the packages they need, are the ones
// Hermes has.
const HERMES_BOOTSTRAP = [
  "import os, sys, runpy",
  "os.environ.pop('PYTHONHOME', None)",
  "os.environ.pop('PYTHONPATH', None)",
  "os.environ.pop('VIRTUAL_ENV', None)",
  "sys.path.insert(0, os.path.expanduser('~/.hermes/hermes-agent'))",
  "os.environ['HERMES_HOME'] = os.environ.get('HERMES_HOME') or os.path.expanduser('~/.hermes')",
  "import hermes_bootstrap",
  "runpy.run_path(os.environ['HERMES_BOT_SCRIPT'], run_name='__main__')",
].join('; ');

// The command that asks the host, with the script that knows the answer.
function capabilityCommand(scriptPath, env) {
  const exports = Object.entries(env)
    .map(([key, value]) => `export ${key}=${shellQuote(String(value))}`)
    .join('; ');
  return [
    exports,
    `export HERMES_BOT_SCRIPT=${shellQuote(scriptPath)}`,
    // The Python of Hermes: the one that runs it, not the one of the system.
    'PY=$(ls -1d "$HOME"/.hermes/tools/python-*/bin/python3 2>/dev/null | tail -1)',
    '[ -n "$PY" ] || PY=python3',
    `"$PY" -I -c ${shellQuote(HERMES_BOOTSTRAP)}`,
  ].join('\n');
}

// A question for the host, asked with the script that knows the answer.
async function askHost(what, env = {}, timeoutMs = 45000) {
  const script = Buffer.from(CAPABILITIES_PYTHON, 'utf8').toString('base64');
  const path = '/tmp/hermesbot-capabilities.py';
  // The cleanup must not mask the script: without the exit round-trip a
  // Python crash looks like success with an empty answer.
  const command = [
    `printf %s ${shellQuote(script)} | base64 -d > ${path}`,
    capabilityCommand(path, { HERMES_BOT_WHAT: what, ...env }),
    'code=$?',
    `rm -f ${path}`,
    'exit $code',
  ].join('\n');
  // Answers grew past the old 8k window the day the local catalogue joined
  // them: a cut answer parses as nothing, and the page blamed the host.
  const result = await runHostCommand(storedConnection(), command, timeoutMs, undefined, {
    maxStdout: 512 * 1024,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) || result.error || 'The host did not answer',
    };
  }
  const answer = lastJsonObject(result.stdout);
  if (!answer) {
    const tail = stderrOf(result).split('\n').slice(-3).join('\n').trim();
    return {
      ok: false,
      error:
        tail || 'The host did not answer with anything the app understands.',
    };
  }
  return answer;
}

// The skills of a profile: what a bot can be taught to do.
ipcMain.handle('hermes:skills', async (_event, payload) => {
  const answer = await askHost('skills', {
    HERMES_BOT_PROFILE: String(payload?.profile ?? ''),
  });
  return {
    ok: Boolean(answer.ok),
    skills: Array.isArray(answer.skills) ? answer.skills : [],
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// A skill is turned on or off on the host, where the skill lives.
ipcMain.handle('hermes:skills:toggle', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim();
  if (!name) return { ok: false, error: 'A skill needs a name' };
  const answer = await askHost('skill-toggle', {
    HERMES_BOT_PROFILE: String(payload?.profile ?? ''),
    HERMES_BOT_VALUE: name,
    HERMES_BOT_ENABLED: payload?.enabled ? '1' : '0',
  });
  return {
    ok: Boolean(answer.ok),
    name,
    enabled: Boolean(payload?.enabled),
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// The tools of a profile: what a bot can use besides Hermes itself.
ipcMain.handle('hermes:toolsets', async (_event, payload) => {
  const answer = await askHost('toolsets', {
    HERMES_BOT_PROFILE: String(payload?.profile ?? ''),
  });
  return {
    ok: Boolean(answer.ok),
    toolsets: Array.isArray(answer.toolsets) ? answer.toolsets : [],
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// A tool is turned on or off on the host, where the tools live.
ipcMain.handle('hermes:toolsets:toggle', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim();
  if (!name) return { ok: false, error: 'A tool needs a name' };
  const answer = await askHost('toolset-toggle', {
    HERMES_BOT_PROFILE: String(payload?.profile ?? ''),
    HERMES_BOT_VALUE: name,
    HERMES_BOT_ENABLED: payload?.enabled ? '1' : '0',
  });
  return {
    ok: Boolean(answer.ok),
    name,
    enabled: Boolean(payload?.enabled),
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// The connectors of the account: the services a bot can reach.
ipcMain.handle('hermes:connectors', async () => {
  const answer = await askHost('connectors', {}, 60000);
  const messages = Array.isArray(answer.messages) ? answer.messages : [];
  const catalog = Array.isArray(answer.catalog) ? answer.catalog : [];
  const toolkit = Array.isArray(answer.toolkit) ? answer.toolkit : [];
  const accounts = Array.isArray(answer.accounts) ? answer.accounts : [];
  const ok = Boolean(answer.ok);
  // Open means the host answered with services, not merely without
  // complaints: a failed ask (ok:false) is never open, and a partial ask
  // that still brought rows is open with a warning attached.
  const hasData =
    catalog.length > 0 || toolkit.length > 0 || accounts.length > 0;
  return {
    ok,
    available: ok && (hasData || messages.length === 0),
    catalog,
    toolkit,
    accounts,
    messages,
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// Sign in with Nous without the terminal: the host mints a device code, the
// page opens where the person approves it, and the poll below waits for that.
ipcMain.handle('hermes:nous:login-start', async () => {
  const answer = await askHost('nous-login-start', {}, 30000);
  return {
    ok: Boolean(answer.ok),
    url: typeof answer.url === 'string' ? answer.url : '',
    user_code: typeof answer.user_code === 'string' ? answer.user_code : '',
    device_code:
      typeof answer.device_code === 'string' ? answer.device_code : '',
    expires_in:
      typeof answer.expires_in === 'number' ? answer.expires_in : 600,
    interval: typeof answer.interval === 'number' ? answer.interval : 5,
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// One poll for the device code above: pending keeps waiting, approval signs
// the host in, denial ends the attempt.
ipcMain.handle('hermes:nous:login-poll', async (_event, payload) => {
  const deviceCode = String(payload?.device_code ?? '').trim();
  if (!deviceCode) return { ok: false, pending: false, error: 'Start again.' };
  const answer = await askHost(
    'nous-login-poll',
    { HERMES_BOT_VALUE: deviceCode },
    30000,
  );
  return {
    ok: Boolean(answer.ok),
    pending: Boolean(answer.pending),
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// The mark of a connector: the shell asks the vendor's service for it and
// hands the bytes over. The window touches no network of its own, and the
// only address it will fetch is the one of that service.
ipcMain.handle('hermes:connectors:logo', async (_event, payload) => {
  const url = String(payload?.url ?? '').trim();
  if (!/^https:\/\/logos\.composio\.dev\/api\/[a-z0-9_-]+$/i.test(url)) {
    return { ok: false };
  }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false };
    const type = response.headers.get('content-type') || 'image/svg+xml';
    if (!/^image\//.test(type)) return { ok: false };
    const bytes = Buffer.from(await response.arrayBuffer());
    // A mark is a mark: a picture bigger than this is not one.
    if (bytes.length > 256 * 1024) return { ok: false };
    return {
      ok: true,
      logo: `data:${type};base64,${bytes.toString('base64')}`,
    };
  } catch {
    return { ok: false };
  }
});

// Connecting one is a question the host answers: it mints the link the
// service wants the person to open. The shell hands that link to the Mac,
// and nothing else.
ipcMain.handle('hermes:connectors:connect', async (_event, payload) => {
  const slug = String(payload?.slug ?? '').trim();
  if (!slug) return { ok: false, error: 'A connector needs a name' };
  const answer = await askHost(
    'connector-connect',
    { HERMES_BOT_VALUE: slug },
    90000,
  );
  return {
    ok: Boolean(answer.ok),
    slug,
    url: typeof answer.url === 'string' ? answer.url : '',
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// The link the service asked for opens in the browser: the shell is the one
// allowed to hand an address to the Mac.
ipcMain.handle('hermes:open', (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
    return Promise.resolve({ ok: false });
  }
  return shell
    .openExternal(url)
    .then(() => ({ ok: true }), () => ({ ok: false }));
});



// ------------------------------------------------------------------ chat

// Everything below talks to 127.0.0.1. When Hermes runs on this machine that
// is the port it answers on; when it runs somewhere else, it is the port the
// tunnel forwards to. Either way the key never leaves the app, and nothing
// new needs to be exposed on a server.

// Whether the app is talking to Hermes right now.
function isLive() {
  return Boolean(tunnel) || directPort > 0;
}

// Where Hermes answers, as it answers right now. The tunnel may have taken
// a neighbouring port when the one that was asked for was taken, so the port
// that is live is the one that is used.
function liveEndpoint() {
  const connection = storedConnection();
  if (connection.mode === 'local') {
    if (!directPort) {
      return { error: 'Not connected to Hermes — open Settings and connect first.' };
    }
    return {
      baseUrl: apiBaseUrl('local', { apiPort: directPort }),
      mode: 'local',
    };
  }
  if (!tunnel) {
    return { error: 'Not connected to Hermes — open Settings and connect first.' };
  }
  return {
    baseUrl: apiBaseUrl('ssh', { localPort: tunnel.localPort }),
    mode: 'ssh',
  };
}

// The app can be opened with no tunnel (auto-connect off, or the server was
// asleep). Any request that needs Hermes tries once to connect instead of
// answering "not connected" to someone who never asked to be offline.
let lastConnectAttempt = 0;

async function ensureConnected() {
  if (isLive()) return true;
  // Someone who asked to stay offline stays offline.
  if (manualDisconnect) return false;
  if (Date.now() - lastConnectAttempt < 5000) return false;
  lastConnectAttempt = Date.now();
  await connectNow().catch(() => undefined);
  return isLive();
}

function liveTunnelOrError() {
  const endpoint = liveEndpoint();
  if (endpoint.error) return endpoint;
  const apiKey = storedApiKey();
  if (!apiKey) return { error: 'No API key configured — import it in Settings.' };
  return { ...endpoint, apiKey };
}

// Every profile mints its own API_SERVER_KEY when it is created, and the
// gateway checks /p/<name>/ against THAT key: a bot's turns cannot ride the
// primary profile's key. Keys are read from the profile's .env over the
// connection the app already has, then kept for the rest of the session.
const profileKeys = new Map();

async function apiKeyFor(profile) {
  const stored = storedApiKey();
  if (!profile || profile === 'default') return stored;
  if (profileKeys.has(profile)) return profileKeys.get(profile);
  if (!PROFILE_NAME_RE.test(profile)) return stored;
  const result = await runHostCommand(
    storedConnection(),
    `grep -m1 '^API_SERVER_KEY=' "$HOME/.hermes/profiles/${profile}/.env" | cut -d= -f2-`,
    15000,
  );
  const key = String(result.stdout ?? '').trim().split('\n')[0].trim();
  if (!key) return stored;
  profileKeys.set(profile, key);
  return key;
}

// A bot that was made a moment ago is not served by the gateway yet. The
// person asking for it is waiting for an answer anyway, so the wait happens
// here rather than failing a message that would have worked.
async function awaitWarming(profile) {
  if (!profile) return;
  const warming = warmingBots.get(profile);
  if (!warming) return;
  await Promise.race([
    warming.promise,
    new Promise((resolve) => setTimeout(resolve, 35000)),
  ]);
}

async function apiCall(pathname, { method = 'GET', body, profile, timeoutMs = 30000, waitForWarming = true } = {}) {
  if (waitForWarming) await awaitWarming(profile);
  if (!isLive()) await ensureConnected();
  const live = liveTunnelOrError();
  if (live.error) return { ok: false, status: 0, error: live.error };
  const apiKey = await apiKeyFor(profile);
  if (!apiKey) return { ok: false, status: 0, error: 'No API key configured — import it in Settings.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(live.baseUrl, profile, pathname), {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, body: json, text };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error.name === 'AbortError'
          ? 'The server took too long to answer'
          : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function apiErrorText(result, fallback) {
  const body = result?.body;
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    if (body.error && typeof body.error.message === 'string') return body.error.message;
  }
  return result?.error || result?.text?.slice(0, 240) || fallback;
}

// A thread in the app is a session in Hermes: created on its first message and
// reused for every turn after that, so the bot keeps the conversation's memory.
// Hermes refuses a second session with a title already in use, which is exactly
// what happens when a thread is reopened after an app restart: the conversation
// still exists on the server under that title. Finding it is the correct answer
// — the thread resumes instead of the composer dying on an id nobody shows.
async function sessionIdByTitle(title, profile) {
  const list = await apiCall('/api/sessions', { profile, timeoutMs: 15000 });
  if (!list.ok) return '';
  const rows = list.body?.data ?? list.body?.sessions ?? [];
  const hit = rows
    .filter(
      (row) => row && String(row.title ?? '') === title && !row.archived,
    )
    .sort((a, b) => Number(b.last_active ?? 0) - Number(a.last_active ?? 0))[0];
  return hit?.id ? String(hit.id) : '';
}

ipcMain.handle('hermes:session', async (_event, payload) => {
  const title = String(payload?.title ?? '').slice(0, 120) || 'Hermes Bot';
  const create = (value) =>
    apiCall('/api/sessions', {
      method: 'POST',
      profile: payload?.profile,
      body: { title: value },
    });

  let result = await create(title);
  if (!result.ok && /title already in use/i.test(apiErrorText(result, ''))) {
    const existing = await sessionIdByTitle(title, payload?.profile);
    if (existing) return { ok: true, sessionId: existing, resumed: true };
    // The title is taken by something we cannot see (another profile, an
    // archived row): a suffixed title keeps the user's message flowing.
    result = await create(`${title} · ${String(Date.now()).slice(-5)}`);
  }
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'Could not open a conversation with the bot'),
    };
  }
  const sessionId = result.body?.session?.id || result.body?.id;
  if (!sessionId) {
    return { ok: false, error: 'The server did not return a session id' };
  }
  return { ok: true, sessionId };
});

// The conversations Hermes holds. A session IS a conversation: it keeps the
// whole transcript, and it is the only place the app stores one. Listing them
// is how the app rebuilds its sidebar after a restart, without a single local
// trace of what was said.
const SESSION_PAGE = 100;
const SESSION_PAGES = 10;

ipcMain.handle('hermes:sessions', async (_event, payload) => {
  const profile = payload?.profile;
  const sessions = [];
  const seen = new Set();
  let offset = 0;
  // The gateway labels a session by the source that opened it; the app's own
  // conversations all come from the API server. A server that ignores the
  // filter says so with the rows it sends back.
  let honoured = true;
  for (let page = 0; page < SESSION_PAGES; page += 1) {
    const result = await apiCall(
      `/api/sessions?limit=${SESSION_PAGE}&offset=${offset}&order=recent&source=api_server`,
      { profile, timeoutMs: 20000 },
    );
    if (!result.ok) {
      return {
        ok: false,
        error: apiErrorText(result, 'Could not list the conversations'),
      };
    }
    const rows = result.body?.data ?? result.body?.sessions ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      const id = String(row?.id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (String(row?.source ?? 'api_server') !== 'api_server') {
        honoured = false;
        continue;
      }
      sessions.push({
        id,
        title: String(row?.title ?? ''),
        messageCount: Number(row?.message_count ?? 0),
        lastActive: Number(row?.last_active ?? 0),
        archived: Boolean(row?.archived),
      });
    }
    if (result.body?.has_more === false) break;
    if (honoured && rows.length < SESSION_PAGE) break;
    offset += rows.length;
  }
  return { ok: true, sessions };
});

// The transcript of one conversation, oldest first: what the app shows when a
// conversation is reopened.
ipcMain.handle('hermes:messages', async (_event, payload) => {
  const sessionId = String(payload?.sessionId ?? '').trim();
  if (!sessionId) return { ok: false, error: 'No conversation to read' };
  const limit = Math.min(Math.max(Number(payload?.limit ?? 200) || 200, 1), 500);
  const result = await apiCall(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}&order=oldest&inline_images=false`,
    { profile: payload?.profile, timeoutMs: 30000 },
  );
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'Could not read the conversation'),
    };
  }
  const rows = result.body?.data ?? result.body?.messages ?? [];
  const messages = [];
  for (const row of rows) {
    messages.push({
      role: String(row?.role ?? ''),
      content: typeof row?.content === 'string' ? row.content : '',
      timestamp: Number(row?.timestamp ?? 0),
    });
  }
  return { ok: true, messages };
});

// Renaming a conversation keeps it findable: the app links a thread to its
// session by title, so a bot that changes its name must carry its session
// along. Hermes refuses a title already in use, which is the right answer.
ipcMain.handle('hermes:session:rename', async (_event, payload) => {
  const sessionId = String(payload?.sessionId ?? '').trim();
  const title = String(payload?.title ?? '').trim().slice(0, 120);
  if (!sessionId) return { ok: false, error: 'No conversation to rename' };
  if (!title) return { ok: false, error: 'A conversation needs a name' };
  const result = await apiCall(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    profile: payload?.profile,
    body: { title },
  });
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'Could not rename the conversation'),
    };
  }
  return { ok: true, title: String(result.body?.title ?? title) };
});

// The identity of a bot — its name, its colour, the shape it wears — is kept
// in the profile's own metadata, the same block Hermes paints the bot with.
// Writing it there is what makes the bot the same bot after a restart.
//
// The primary profile is not a named one: it lives at the root of the Hermes
// home, and it is the bot the app always has. The name "default" reaches it.
const UPDATE_BOT_META_PYTHON = `import json
import os
import pathlib
import sys

import yaml

path = pathlib.Path(os.environ.get("HERMES_BOT_PROFILE", ""))
title = sys.argv[1].strip()
color = sys.argv[2].strip()
shape = sys.argv[3].strip()

data = {}
if path.exists():
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}

ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
bots = ui.get("hermes-bots") if isinstance(ui.get("hermes-bots"), dict) else {}

changed = False
if title and title != str(bots.get("title") or ""):
    bots["title"] = title
    changed = True
if color and color != str(bots.get("color") or ""):
    bots["color"] = color
    changed = True
if shape and shape != str(bots.get("shape") or ""):
    bots["shape"] = shape
    changed = True

if changed:
    ui["hermes-bots"] = bots
    data["ui_meta"] = ui
    tmp = path.with_name(path.name + ".hermesbot-tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
    os.replace(tmp, path)

print(json.dumps({
    "title": str(bots.get("title") or ""),
    "color": str(bots.get("color") or ""),
    "shape": str(bots.get("shape") or ""),
}, separators=(",", ":")))
`;

ipcMain.handle('hermes:bot:update', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim().toLowerCase();
  // The primary profile is the one the app always has; it is not a named one.
  const isPrimary = name === 'default' || name === '';
  if (!isPrimary && !PROFILE_NAME_RE.test(name)) {
    return { ok: false, error: 'That is not a bot name Hermes knows.' };
  }
  const title = String(payload?.title ?? '').trim().slice(0, 80);
  const color = sanitizeBotColor(payload?.color);
  const shape = String(payload?.shape ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 24);
  if (!title && !color && !shape) {
    return { ok: false, error: 'Nothing to change on that bot.' };
  }
  const connection = storedConnection();
  if (!isLive()) await ensureConnected();
  const script = Buffer.from(UPDATE_BOT_META_PYTHON, 'utf8').toString('base64');
  const target = isPrimary
    ? '"$HOME/.hermes/profile.yaml"'
    : `"$HOME/.hermes/profiles/${name}/profile.yaml"`;
  const label = isPrimary ? 'default' : name;
  const result = await runHostCommand(
    connection,
    [
      `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-style-${label}.py`,
      `HERMES_BOT_PROFILE=${target} python3 /tmp/hermesbot-style-${label}.py ${shellQuote(title)} ${shellQuote(color)} ${shellQuote(shape)}`,
      `rm -f /tmp/hermesbot-style-${label}.py`,
    ].join('\n'),
    30000,
  );
  if (!result.ok) {
    return {
      ok: false,
      error: stderrOf(result) || result.error || 'Could not update the bot',
    };
  }
  let meta = { title: '', color: '', shape: '' };
  try {
    const parsed = JSON.parse(result.stdout.trim().split('\n').pop() || '{}');
    meta = {
      title: String(parsed.title || ''),
      color: String(parsed.color || ''),
      shape: String(parsed.shape || ''),
    };
  } catch {
    meta = { title, color, shape };
  }
  return { ok: true, name: isPrimary ? 'default' : name, ...meta };
});

// Deleting a conversation deletes the session that holds it: the transcript
// lives there, and nowhere else.
ipcMain.handle('hermes:session:delete', async (_event, payload) => {
  const sessionId = String(payload?.sessionId ?? '').trim();
  if (!sessionId) return { ok: false, error: 'No conversation to delete' };
  const result = await apiCall(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    profile: payload?.profile,
    timeoutMs: 30000,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'Could not delete the conversation'),
    };
  }
  return { ok: true };
});

// Deleting a bot deletes the profile that is the bot. A bot that only left
// the app's sidebar would come back with the next refresh, which is no
// deletion at all.
//
// The tombstone comes first: Hermes skips a name that carries one, so nothing
// can relist the bot while it is being torn down. The gateway is then told to
// stop serving it, and the profile goes.
const DELETE_BOT_SCRIPT = `set -u

ROOT="$HOME/.hermes"
NAME="$1"
P="$ROOT/profiles/$NAME"

mkdir -p "$ROOT/profiles/.deleted"
: > "$ROOT/profiles/.deleted/$NAME"

python3 - "$ROOT" "$NAME" <<'PY' >/dev/null 2>&1 || true
import sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root / "hermes-agent"))
try:
    from gateway.control_socket import request_unserve_profile
    try:
        request_unserve_profile(root, sys.argv[2], timeout=5.0)
    except TypeError:
        request_unserve_profile(root, sys.argv[2])
except Exception:
    pass
PY

rm -rf "$P"
echo "OK $NAME"
`;

ipcMain.handle('hermes:bot:delete', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim().toLowerCase();
  if (!PROFILE_NAME_RE.test(name)) {
    return { ok: false, error: 'That is not a bot name Hermes knows.' };
  }
  if (RESERVED_PROFILE_NAMES.has(name)) {
    return { ok: false, error: 'That bot cannot be deleted.' };
  }
  const connection = storedConnection();
  const script = Buffer.from(DELETE_BOT_SCRIPT, 'utf8').toString('base64');
  const result = await runHostCommand(
    connection,
    [
      `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-delete-${name}.sh`,
      `bash /tmp/hermesbot-delete-${name}.sh ${shellQuote(name)}`,
      `rm -f /tmp/hermesbot-delete-${name}.sh`,
    ].join('\n'),
    60000,
  );
  const line = result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('OK '));
  if (!result.ok || !line) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        'Could not delete the bot on the server',
    };
  }
  profileKeys.delete(name);
  return { ok: true, name };
});

// A file the person attaches has to live where the bot can read it: the app
// copies it to the server over the SSH it already uses, and the message
// carries its path. The bytes go down the pipe, never through a command line.
const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

ipcMain.handle('hermes:attachment:upload', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim();
  const data = String(payload?.data ?? '');
  if (!name) return { ok: false, error: 'The file has no name' };
  if (!data) return { ok: false, error: 'The file is empty' };
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) return { ok: false, error: 'The file is empty' };
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'The file is too large (8 MB max)' };
  }
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-60) || 'file';
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  // The path is built here and quoted with double quotes, so the shell that
  // runs the command expands the home it knows and the bot reads a real path.
  const remote = `"$HOME/.hermes/attachments/${stamp}-${safe}"`;
  const connection = storedConnection();
  const result = await runHostCommand(
    connection,
    [
      'mkdir -p "$HOME/.hermes/attachments"',
      `cat > ${remote}`,
      // The bot reads a real path, not the tilde the shell knows.
      `printf %s ${remote}`,
    ].join(' && '),
    60000,
    bytes,
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        `Could not copy ${name} to ${
          connection.mode === 'local' ? 'this Mac' : connection.sshHost
        }`,
    };
  }
  return {
    ok: true,
    name,
    path: result.stdout.trim() || remote,
    bytes: bytes.length,
  };
});

// The dictation: the browser's own speech service is not an option — the key
// Chromium carries is refused by the service, and a refusal looks exactly like
// a broken connection. Hermes transcribes instead: the recording is copied to
// the machine that runs Hermes and handed to the transcription Hermes already
// has.
const TRANSCRIBE_VOICE_PYTHON = `import json
import os
import sys

# The agent's own directory, told by the shell that runs this: the home of
# the person is not the same on every machine.
agent_home = os.environ.get("HERMES_AGENT_HOME", "")
if agent_home:
    sys.path.insert(0, agent_home)

from tools.transcription_tools import transcribe_audio

try:
    print(json.dumps(transcribe_audio(sys.argv[1]), separators=(",", ":")))
except Exception as exc:
    print(json.dumps({"success": False, "transcript": "", "error": str(exc)}, separators=(",", ":")))
`;

ipcMain.handle('hermes:voice:transcribe', async (_event, payload) => {
  const data = String(payload?.data ?? '');
  const mimeType = String(payload?.mimeType ?? 'audio/webm');
  if (!data) return { ok: false, error: 'Nothing was recorded' };
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) return { ok: false, error: 'Nothing was recorded' };
  if (bytes.length > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'The recording is too large (8 MB max)' };
  }
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const remote = `"$HOME/.hermes/attachments/${stamp}-voice.${extension}"`;
  const script = Buffer.from(TRANSCRIBE_VOICE_PYTHON, 'utf8').toString('base64');
  const connection = storedConnection();
  const result = await runHostCommand(
    connection,
    [
      `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-voice.py`,
      'mkdir -p "$HOME/.hermes/attachments"',
      `cat > ${remote}`,
      // Hermes runs with its own python and its own dependencies: the ones the
      // gateway was started with are the ones that can transcribe.
      'PY=$(ls "$HOME"/.hermes/tools/python-*/bin/python3 2>/dev/null | head -1)',
      'PP=$(ls -d "$HOME"/.hermes/cache/uv/archive-v0/*/ 2>/dev/null | tr "\\n" ":")',
      `cd "$HOME/.hermes/hermes-agent" && HERMES_AGENT_HOME="$HOME/.hermes/hermes-agent" PYTHONPATH="$PP" "$PY" /tmp/hermesbot-voice.py ${remote}`,
      'rm -f /tmp/hermesbot-voice.py',
    ].join('\n'),
    180000,
    bytes,
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        'The recording could not be transcribed on the server',
    };
  }
  const answer = lastJsonObject(result.stdout);
  if (!answer) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        'The server did not answer with a transcription',
    };
  }
  if (!answer.success) {
    return {
      ok: false,
      error: String(answer.error || 'The recording could not be transcribed'),
    };
  }
  const transcript = String(answer.transcript || '').trim();
  if (!transcript) {
    return { ok: false, error: 'Nothing was heard.' };
  }
  return { ok: true, transcript };
});

// The app's own preferences — the models the picker offers, the ones that are
// pinned, the model each bot falls back to — live with the bot that is always
// there: the primary profile. Nothing about them is written on this machine.
const PREFS_PYTHON = `import json
import os
import pathlib
import sys

import yaml

path = pathlib.Path(os.environ.get("HERMES_BOT_PROFILE", ""))
mode = sys.argv[1] if len(sys.argv) > 1 else "read"

data = {}
if path.exists():
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}

ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}

if mode == "read":
    # The app was called Grok Bot before: those preferences are read once and
    # carried over, so the rename costs the person nothing.
    prefs = ui.get("hermes-bot")
    if not isinstance(prefs, dict) or not prefs:
        prefs = ui.get("grok-bot") if isinstance(ui.get("grok-bot"), dict) else {}
    print(json.dumps({"ok": True, "prefs": prefs}, separators=(",", ":")))
else:
    # The preferences come down the pipe, so they never pass through a command
    # line.
    try:
        prefs = json.loads(sys.stdin.read() or "{}")
    except Exception:
        prefs = {}
    if not isinstance(prefs, dict):
        prefs = {}
    ui["hermes-bot"] = prefs
    data["ui_meta"] = ui
    tmp = path.with_name(path.name + ".hermesbot-tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
    os.replace(tmp, path)
    print(json.dumps({"ok": True}, separators=(",", ":")))
`;

function prefsCommand(script, action, payload) {
  const connection = storedConnection();
  const parts = [
    `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-prefs.py`,
    `HERMES_BOT_PROFILE="$HOME/.hermes/profile.yaml" python3 /tmp/hermesbot-prefs.py ${action}`,
    'rm -f /tmp/hermesbot-prefs.py',
  ];
  return runHostCommand(connection, parts.join('\n'), 20000, payload);
}

ipcMain.handle('hermes:prefs', async () => {
  const script = Buffer.from(PREFS_PYTHON, 'utf8').toString('base64');
  const result = await prefsCommand(script, 'read');
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        'The preferences could not be read from the server',
    };
  }
  const answer = lastJsonObject(result.stdout);
  return { ok: true, prefs: answer?.prefs ?? {} };
});

ipcMain.handle('hermes:prefs:save', async (_event, payload) => {
  const script = Buffer.from(PREFS_PYTHON, 'utf8').toString('base64');
  const result = await prefsCommand(
    script,
    'write',
    Buffer.from(JSON.stringify(payload?.prefs ?? {}), 'utf8'),
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        'The preferences could not be saved on the server',
    };
  }
  return { ok: true };
});

// Model inventory for the picker. Hermes answers with one row per provider;
// only the authenticated ones can actually run a turn, so those are the ones
// worth offering, plus whatever is currently configured.
ipcMain.handle('hermes:models', async (_event, payload) => {
  const result = await apiCall('/api/model/options', {
    profile: payload?.profile,
    timeoutMs: 20000,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'Could not list the models'),
    };
  }
  const body = result.body || {};
  const currentModel = String(body.model ?? '');
  const currentProvider = String(body.provider ?? '');
  const models = [];
  for (const provider of body.providers ?? []) {
    // Only providers that can run a turn: an unconfigured row would fail on
    // send and looks like a choice the app could not keep.
    if (!provider?.authenticated) continue;
    for (const model of provider.models ?? []) {
      const id = typeof model === 'string' ? model : model?.id;
      if (!id) continue;
      models.push({
        model: id,
        provider: provider.slug,
        providerName: provider.name,
        current: id === currentModel && provider.slug === currentProvider,
      });
    }
  }
  return {
    ok: true,
    current: currentModel,
    currentProvider,
    models,
  };
});

// Which bots exist is the gateway's answer, not the disk's: a profile
// directory outlives the bot (deleted names leave one behind until cleanup)
// and a profile the gateway has not picked up yet is not one the app can talk
// to. `served_profiles` on the control socket is what Hermes itself shows.
const LIST_PROFILES_PY = `
import json, socket
from pathlib import Path

home = Path.home() / ".hermes"
path = home / "gateway.sock"
pointer = home / "gateway.sock.path"
if not path.exists() and pointer.is_file():
    candidate = Path(pointer.read_text(encoding="utf-8-sig").strip())
    if candidate.exists():
        path = candidate

if not path.exists():
    print(json.dumps({"ok": False, "error": "The Hermes gateway is not running"}))
    raise SystemExit(0)

try:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(4)
    client.connect(str(path))
    client.sendall(b'{"verb": "identify"}\\n')
    answer = b""
    while True:
        chunk = client.recv(65536)
        if not chunk:
            break
        answer += chunk
    client.close()
    payload = json.loads(answer.decode() or "{}")
    served = (payload.get("result") or {}).get("served_profiles")
    if not isinstance(served, list):
        raise ValueError("the gateway did not report its profiles")
    profiles = []
    for raw in served:
        name = str(raw).strip()
        if not name or name == "default":
            continue
        title = ""
        color = ""
        shape = ""
        # The same ui_meta block the Hermes desktop app reads for the name and
        # colour it paints this bot with.
        try:
            import yaml
            meta = home / "profiles" / name / "profile.yaml"
            data = yaml.safe_load(meta.read_text()) or {}
            bots = (data.get("ui_meta") or {}).get("hermes-bots") or {}
            title = str(bots.get("title") or "")
            color = str(bots.get("color") or "")
            shape = str(bots.get("shape") or "")
        except Exception:
            pass
        profiles.append({"name": name, "title": title, "color": color, "shape": shape})
    # The primary profile is the bot the app always has. It is not a named
    # one: its metadata sits at the root of the Hermes home.
    primary = {"title": "", "color": "", "shape": ""}
    try:
        import yaml
        data = yaml.safe_load((home / "profile.yaml").read_text()) or {}
        bots = (data.get("ui_meta") or {}).get("hermes-bots") or {}
        primary = {
            "title": str(bots.get("title") or ""),
            "color": str(bots.get("color") or ""),
            "shape": str(bots.get("shape") or ""),
        }
    except Exception:
        pass
    print(json.dumps({"ok": True, "profiles": profiles, "primary": primary}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc)}))
`;

// Only used when the gateway cannot answer: the profile directories minus the
// tombstoned names, which is the closest offline guess at the bot list.
const LIST_PROFILES_SH = `
root="$HOME/.hermes/profiles"
for dir in "$root"/*; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  case "$name" in .*) continue ;; esac
  [ -e "$root/.deleted/$name" ] && continue
  printf '%s\\n' "$name"
done
`;

function lastJsonObject(text) {
  const lines = String(text ?? '').trim().split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking: Python warnings can precede the answer.
    }
  }
  return null;
}

function cleanProfiles(values) {
  const seen = new Map();
  for (const value of values ?? []) {
    const raw = typeof value === 'string' ? { name: value } : value ?? {};
    const name = String(raw.name ?? '').trim();
    if (!name || name === 'default') continue;
    if (!PROFILE_NAME_RE.test(name)) continue;
    if (RESERVED_PROFILE_NAMES.has(name)) continue;
    seen.set(name, {
      name,
      title: String(raw.title ?? '').trim(),
      color: String(raw.color ?? '').trim(),
      shape: String(raw.shape ?? '').trim(),
      // A disk-only profile the gateway does not serve yet warms up in the
      // sidebar instead of vanishing until the next rescan.
      ...(raw.served === false ? { served: false } : {}),
    });
  }
  return [...seen.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function cleanPrimary(value) {
  const raw = value ?? {};
  return {
    title: String(raw.title ?? '').trim(),
    color: String(raw.color ?? '').trim(),
    shape: String(raw.shape ?? '').trim(),
  };
}

ipcMain.handle('hermes:profiles', async () => {
  const connection = storedConnection();
  if (connection.mode === 'ssh' && !connection.sshHost) {
    return {
      ok: false,
      error:
        'No host configured — open Settings to say where Hermes runs.',
    };
  }
  const live = await runHostCommand(
    connection,
    `python3 - <<'PY'\n${LIST_PROFILES_PY}PY`,
    20000,
  );
  const answer = lastJsonObject(live.stdout);
  if (live.ok && answer?.ok && Array.isArray(answer.profiles)) {
    return {
      ok: true,
      source: 'gateway',
      profiles: cleanProfiles(answer.profiles),
      primary: cleanPrimary(answer.primary),
    };
  }

  const disk = await runHostCommand(connection, LIST_PROFILES_SH, 15000);
  if (!disk.ok) {
    return {
      ok: false,
      error:
        live.error ||
        answer?.error ||
        String(disk.stderr ?? '').trim() ||
        'Could not list the bots',
    };
  }
  return {
    ok: true,
    source: 'disk',
    warning: answer?.error || 'The gateway is not answering, so this list comes from disk.',
    profiles: cleanProfiles(String(disk.stdout ?? '').split('\n')),
    primary: cleanPrimary(answer?.primary),
  };
});

function parseSseFrame(frame) {
  let event = 'message';
  const data = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join('\n') };
}

// Turns in flight, so the renderer can abandon one when a new message lands in
// the same conversation.
const chatRequests = new Map();

// One agent turn, streamed. Hermes emits the assistant's text as it is written
// and reports failures (a rejected key, an exhausted quota) as an `error`
// event long before the turn would end, so the app can stop waiting instead of
// sitting on a request that the server keeps retrying.
ipcMain.handle('hermes:chat:send', async (event, payload) => {
  if (!isLive()) await ensureConnected();
  // A bot that was made a moment ago is not served yet: the person is waiting
  // for the answer anyway, so the wait belongs here.
  await awaitWarming(payload?.profile);
  const live = liveTunnelOrError();
  if (live.error) return { ok: false, error: live.error };
  const apiKey = await apiKeyFor(payload?.profile);
  if (!apiKey) return { ok: false, error: 'No API key configured — import it in Settings.' };

  const sessionId = String(payload?.sessionId ?? '').trim();
  const message = String(payload?.message ?? '');
  if (!sessionId) return { ok: false, error: 'No conversation to talk to' };
  if (!message.trim()) return { ok: false, error: 'Empty message' };

  const body = { message };
  if (payload?.model) {
    body.model = String(payload.model);
    // The session row remembers the model of its last turn, and Hermes prefers
    // it over a plain `model` in the body. A lock makes the model the picker
    // shows the one that actually runs, including when it changes mid-thread.
    body.require_model_lock = true;
  }
  if (payload?.provider) body.provider = String(payload.provider);
  // Ephemeral per-turn instructions: Hermes appends them to the system prompt
  // and leaves the stored conversation untouched.
  if (payload?.instructions) body.system_message = String(payload.instructions);

  const controller = new AbortController();
  const requestId = String(payload?.requestId ?? '');
  // A new message in the same thread cancels the previous turn by request id.
  if (requestId) chatRequests.set(requestId, controller);
  const send = (channel, data) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send(channel, { requestId, ...data });
  };
  // Two different waits. A whole turn may legitimately take minutes, but a
  // server that stops producing events — the agent retrying a rate-limited
  // call for ten minutes without a word — must not hold the composer hostage.
  // Silence is the signal.
  const SILENCE_MS = 45000;
  const HARD_LIMIT_MS = 5 * 60 * 1000;
  let silent = false;
  const hardStop = setTimeout(() => controller.abort(), HARD_LIMIT_MS);
  let silenceTimer = null;
  const armSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      silent = true;
      controller.abort();
    }, SILENCE_MS);
  };
  armSilence();

  let text = '';
  let failure = '';

  try {
    const response = await fetch(
      apiUrl(live.baseUrl, payload?.profile, `/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const raw = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      return {
        ok: false,
        error: apiErrorText({ status: response.status, body: parsed, text: raw }, `HTTP ${response.status}`),
      };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');
        if (!frame.trim() || frame.startsWith(':')) continue;
        // Keepalives are not progress; anything else restarts the clock.
        armSilence();

        const { event: name, data } = parseSseFrame(frame);
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = null;
        }

        if (name === 'assistant.delta' && parsed?.delta) {
          text += parsed.delta;
          send('hermes:chat:delta', { text: parsed.delta });
        } else if (name === 'tool.started' && parsed?.tool_name) {
          send('hermes:chat:tool', { tool: parsed.tool_name });
        } else if (name === 'assistant.completed') {
          const final = parsed?.message?.content ?? parsed?.text;
          if (typeof final === 'string' && !text) text = final;
        } else if (name === 'error') {
          failure = parsed?.message || 'The bot stopped before answering';
        } else if (name === 'run.failed') {
          failure = failure || 'The bot could not finish this turn';
        } else if (name === 'done') {
          if (failure) return { ok: false, error: failure };
          return { ok: true, text };
        }
      }
    }

    if (failure) return { ok: false, error: failure };
    return { ok: true, text };
  } catch (error) {
    if (error.name === 'AbortError') {
      if (controller.canceled) return { ok: false, canceled: true };
      return {
        ok: false,
        error: silent
          ? 'The bot stopped answering — the model may be out of quota, or the server cannot reach it. Try another model from the picker.'
          : 'The bot took more than five minutes to answer.',
      };
    }
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(hardStop);
    clearTimeout(silenceTimer);
    chatRequests.delete(requestId);
  }
});

// Abandon a turn: the renderer has a newer message for the same conversation.
// Closing the stream also tells Hermes to interrupt the run, so the next turn
// does not race a run that is still writing into the session.
ipcMain.handle('hermes:chat:cancel', (_event, requestId) => {
  const controller = chatRequests.get(String(requestId ?? ''));
  if (!controller) return { ok: false };
  controller.canceled = true;
  controller.abort();
  return { ok: true };
});



// ------------------------------------------------------------------ bots

// A bot IS a Hermes profile. These names are reserved by Hermes itself
// (hermes_constants.PROFILE_ID_RE + hermes_cli.profiles._RESERVED_NAMES), so we
// refuse them early instead of surfacing a confusing remote failure.
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESERVED_PROFILE_NAMES = new Set([
  'hermes',
  'default',
  'test',
  'tmp',
  'root',
  'sudo',
]);

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

// Colours travel into the profile's bot metadata, so they must be something a
// browser can paint — nothing else reaches the remote python that writes it.
const BOT_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|hsl\(\s*\d{1,3}(?:\.\d+)?\s+\d{1,3}%\s+\d{1,3}%\s*\))$/;

function sanitizeBotColor(value) {
  const color = String(value ?? '').trim();
  return BOT_COLOR_RE.test(color) ? color : '';
}

// Writes the bot's title and colour into its profile metadata, the same file
// and the same keys the Hermes desktop app reads, so both apps draw the bot
// identically. Atomic replace: a half-written profile would confuse Hermes.
const META_PYTHON = `import os
import pathlib
import sys

import yaml

path = pathlib.Path(sys.argv[1])
title = sys.argv[2].strip()
color = sys.argv[3].strip()
description = sys.argv[4].strip() if len(sys.argv) > 4 else ""
shape = sys.argv[5].strip() if len(sys.argv) > 5 else ""

data = {}
if path.exists():
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}

if description:
    data["description"] = description
    data["description_auto"] = False

ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
bots = ui.get("hermes-bots") if isinstance(ui.get("hermes-bots"), dict) else {}
if title:
    bots["title"] = title
if color:
    bots["color"] = color
if shape:
    bots["shape"] = shape
ui["hermes-bots"] = bots
data["ui_meta"] = ui

tmp = path.with_name(path.name + ".hermesbot-tmp")
tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
os.replace(tmp, path)
`;

// Reading a profile's bot metadata back, compact JSON so it can ride one line
// of the job log. Prints "" fields when nothing is stored.
const READ_META_PYTHON = `import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
data = {}
try:
    import yaml
    data = yaml.safe_load(path.read_text()) or {}
except Exception:
    data = {}

bots = {}
if isinstance(data, dict) and isinstance(data.get("ui_meta"), dict):
    bots = data["ui_meta"].get("hermes-bots") or {}
if not isinstance(bots, dict):
    bots = {}

print(json.dumps({"title": bots.get("title") or "", "color": bots.get("color") or ""}, separators=(",", ":")))
`;

// Opening a bot that already exists: read what Hermes shows for it, and only
// write the title/colour when they actually change, so the colour someone
// picked in Hermes is never overwritten by a guess. One process, one round
// trip — this is the difference between 8 seconds and one.
const ADOPT_BOT_META_PYTHON = `import json
import os
import pathlib
import sys

import yaml

path = pathlib.Path(os.environ.get("HERMES_BOT_PROFILE", ""))
title = sys.argv[1].strip()
color = sys.argv[2].strip()

data = {}
if path.exists():
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}

ui = data.get("ui_meta") if isinstance(data.get("ui_meta"), dict) else {}
bots = ui.get("hermes-bots") if isinstance(ui.get("hermes-bots"), dict) else {}
now_title = str(bots.get("title") or "")
now_color = str(bots.get("color") or "")

changed = False
if title and title != now_title:
    bots["title"] = title
    now_title = title
    changed = True
if color and color != now_color:
    bots["color"] = color
    now_color = color
    changed = True

if changed:
    ui["hermes-bots"] = bots
    data["ui_meta"] = ui
    tmp = path.with_name(path.name + ".hermesbot-tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
    os.replace(tmp, path)

print(json.dumps({"title": now_title, "color": now_color}, separators=(",", ":")))
`;

// A bot IS a Hermes profile: a directory under ~/.hermes/profiles carrying the
// files that make it one. Hermes lists any directory with a config.yaml,
// profile.yaml, .env or SOUL.md in it, but listing is not serving: the gateway
// answers /p/<name>/ only for the profiles it holds adapters for, so a profile
// written to disk behind its back answers "Unknown or unconfigured profile"
// until the next rescan (30 s) — or forever, when the name carries a tombstone
// from an earlier delete, which makes Hermes treat the directory as dead.
//
// `hermes profile create` builds that properly but costs ~9 s of work per bot
// (config migration, wrapper alias, bookkeeping), and cloning the primary
// profile adds 52 MB of skills copied file by file: that is the minute and a
// half people were waiting. Laying the profile out directly takes ~90 ms, and
// the skills arrive as HARD LINKS — same bytes, no second copy, nothing extra
// on disk. Real copies remain the fallback for another filesystem.
//
// The tree is built in a staging sibling and published with one rename, so the
// profile scanner can never adopt a half-built bot. Messaging tokens and the
// primary's server key stay behind: a bot account belongs to one profile, and
// each bot mints a key of its own (the gateway resolves it per profile, never
// through another profile's env).
const CREATE_BOT_SCRIPT = `set -u

ROOT="$HOME/.hermes"
NAME="$1"
TITLE="$2"
DESC="$3"
COLOR="$4"
SHAPE="$5"
P="$ROOT/profiles/$NAME"
STAGING="$ROOT/profiles/.$NAME.staging-hermesbot"

# Reusing a deleted bot's name is normal, but Hermes keeps a tombstone at
# profiles/.deleted/<name> and skips every profile carrying one — the bot would
# exist and never be served. Creating the bot revives the name.
rm -f "$ROOT/profiles/.deleted/$NAME"

# Already there: nothing to build, and the caller adopts it as it stands.
if [ -e "$P" ]; then
  echo "EXISTS"
  exit 0
fi

rm -rf "$STAGING"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

mkdir -p "$STAGING/memories" "$STAGING/sessions" "$STAGING/skills" \
  "$STAGING/skins" "$STAGING/logs" "$STAGING/plans" "$STAGING/workspace" \
  "$STAGING/cron" "$STAGING/home"

if [ -f "$ROOT/config.yaml" ]; then cp -f "$ROOT/config.yaml" "$STAGING/config.yaml"; fi
if [ -f "$ROOT/SOUL.md" ]; then cp -f "$ROOT/SOUL.md" "$STAGING/SOUL.md"; fi

# The copied soul opens with the primary agent's identity ("You are Hermes").
# A bot answering "I am Hermes" to "who are you?" is the wrong agent wearing
# the right name, so the first line is rewritten before the profile is published.
python3 - "$STAGING/SOUL.md" "$TITLE" "$NAME" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if path.is_file():
    name = (sys.argv[2] or "").strip() or (sys.argv[3] or "").strip()
    text = path.read_text(encoding="utf-8")
    if name and "You are Hermes" in text:
        path.write_text(text.replace("You are Hermes", "You are " + name, 1), encoding="utf-8")
PY
for F in memories/MEMORY.md memories/USER.md; do
  if [ -f "$ROOT/$F" ]; then cp -f "$ROOT/$F" "$STAGING/$F"; fi
done

if [ -f "$ROOT/.env" ]; then
  grep -v -E '^(API_SERVER_KEY|GATEWAY_ALLOW_ALL_USERS|GATEWAY_ALLOWED_USERS|GATEWAY_RELAY_[A-Z_]*|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|SLACK_[A-Z_]*|WHATSAPP_[A-Z_]*|SIGNAL_[A-Z_]*|IMESSAGE_[A-Z_]*|MATRIX_[A-Z_]*|TEAMS_[A-Z_]*|WECOM_[A-Z_]*|QQ_[A-Z_]*|SMS_[A-Z_]*)[A-Z_]*=' "$ROOT/.env" > "$STAGING/.env" || true
fi
printf '\\nAPI_SERVER_KEY=%s\\n' "$(openssl rand -hex 32)" >> "$STAGING/.env"
chmod 600 "$STAGING/.env"

if [ -d "$ROOT/skills" ]; then
  rm -rf "$STAGING/skills"
  cp -al "$ROOT/skills" "$STAGING/skills" 2>/dev/null || cp -a "$ROOT/skills" "$STAGING/skills" 2>/dev/null || true
fi

python3 - "$STAGING/profile.yaml" "$TITLE" "$COLOR" "$DESC" "$SHAPE" <<'PY'
${META_PYTHON}PY

mv "$STAGING" "$P"
trap - EXIT

# Ask the gateway to hot-serve the new profile so the first message does not
# 404 while the 30 s rescan waits; bounded to 3 s and silent on failure, since
# the bot already exists either way.
python3 - "$ROOT" "$NAME" <<'PY' >/dev/null 2>&1 || true
import sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root / "hermes-agent"))
try:
    from gateway.control_socket import request_serve_profile_hot
    try:
        request_serve_profile_hot(root, sys.argv[2], timeout=3.0)
    except TypeError:
        request_serve_profile_hot(root, sys.argv[2])
except Exception:
    pass
PY

META=$(python3 - "$P/profile.yaml" <<'PY'
${READ_META_PYTHON}PY
)
echo "OK $NAME $META"
`;

// Asking the gateway to serve a profile, on its own. The build asks once,
// with the profile's creation; the gateway may not have been able to serve it
// then — the profile it reads is written a moment before. The ask is cheap
// (a python that answers in a tenth of a second) and it is worth asking
// again: a bot that is served now does not wait for the next rescan.
const SERVE_PROFILE_SCRIPT = `set -u

ROOT="$HOME/.hermes"
NAME="$1"

python3 - "$ROOT" "$NAME" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root / "hermes-agent"))
try:
    from gateway.control_socket import request_serve_profile_hot
    try:
        request_serve_profile_hot(root, sys.argv[2], timeout=3.0)
    except TypeError:
        request_serve_profile_hot(root, sys.argv[2])
except Exception:
    pass
PY
`;

// The ask, as a command on the machine that runs Hermes.
function serveProfileCommand(name) {
  const encoded = Buffer.from(SERVE_PROFILE_SCRIPT, 'utf8').toString('base64');
  const remoteScript = `/tmp/hermesbot-serve-${name}.sh`;
  return [
    'set -u',
    `printf %s ${shellQuote(encoded)} | base64 -d > ${remoteScript}`,
    `bash ${remoteScript} ${shellQuote(name)}`,
    `rm -f ${remoteScript}`,
  ].join('\n');
}

// "OK <name> <metadata json>" from the script above.
function parseCreateOutcome(line) {  const rest = line.slice(3).trim();
  const split = rest.indexOf(' ');
  const created = split === -1 ? rest : rest.slice(0, split);
  const rawMeta = split === -1 ? '' : rest.slice(split + 1).trim();
  let meta = { title: '', color: '' };
  if (rawMeta) {
    try {
      const parsed = JSON.parse(rawMeta);
      meta = {
        title: String(parsed.title || ''),
        color: String(parsed.color || ''),
      };
    } catch {
      meta = { title: '', color: '' };
    }
  }
  return { created, meta };
}

// A bot that was made is on the host, but the gateway does not serve a
// profile the moment it is written: Hermes holds its adapters and takes a
// new profile at its next rescan (30 s). The gateway can be asked to serve it
// sooner, and that ask is bounded to 3 s.
//
// So the person, clicking a colour, waited for a question nobody could
// answer faster — and the app said the bot had failed while it was only
// warming up. The wait is taken out of the click: the bot is made, the app
// remembers that it is not served yet, and the waiting happens in the
// background. Anything that asks for the bot waits for it where the person is
// already waiting for an answer.
const warmingBots = new Map();

// The window is told when a bot is served, or when it is not: the page that
// made it has something to say about it.
function tellWindows(name, served) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('hermes:bot:ready', { name, served });
  }
}

// One question, asked once: is the gateway serving this profile yet?
async function botServed(name) {
  const probe = await apiCall('/api/sessions', {
    profile: name,
    timeoutMs: 3000,
    waitForWarming: false,
  });
  return probe.ok;
}

// The waiting, in the background: the profile is asked for until the gateway
// answers, or until the rescan has certainly happened. A link that dropped is
// opened again — the throttle of `ensureConnected` is for an app that is
// idling, not for a bot that is being born.
function startWarming(name, timeoutMs = 60000) {
  const already = warmingBots.get(name);
  if (already) return already;
  const promise = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isLive() && !manualDisconnect) {
        lastConnectAttempt = Date.now();
        await connectNow().catch(() => undefined);
      }
      // The gateway is asked again: the build asked once, and the gateway may
      // not have been able to serve a profile that was written a moment ago.
      await runHostCommand(storedConnection(), serveProfileCommand(name), 10000).catch(
        () => undefined,
      );
      const probe = await apiCall('/api/sessions', {
        profile: name,
        timeoutMs: 4000,
        waitForWarming: false,
      });
      if (probe.ok) return true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return false;
  })();
  warmingBots.set(name, { promise });
  promise.then((served) => {
    warmingBots.delete(name);
    tellWindows(name, served);
  });
  return promise;
}

ipcMain.handle('hermes:bot:create', async (_event, payload) => {
  const connection = storedConnection();
  if (!isLive()) {
    // A person asking for a bot is asking for the link: the throttle that
    // keeps an idle app from reconnecting every few seconds is not for them.
    if (!manualDisconnect) {
      lastConnectAttempt = Date.now();
      await connectNow().catch(() => undefined);
    }
  }
  if (!isLive()) {
    return {
      ok: false,
      error: 'Not connected to Hermes — connect in Settings, then create the bot.',
    };
  }
  const name = String(payload?.name ?? '').trim().toLowerCase();
  const title = String(payload?.title ?? '').trim();
  const description = String(payload?.description ?? '').trim();
  const color = sanitizeBotColor(payload?.color);
  const shape = String(payload?.shape ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 24);

  if (!PROFILE_NAME_RE.test(name)) {
    return {
      ok: false,
      error:
        'A bot name becomes a Hermes profile id: lowercase letters, digits, dashes or underscores only.',
    };
  }
  if (RESERVED_PROFILE_NAMES.has(name)) {
    return {
      ok: false,
      error: `"${name}" is reserved by Hermes — pick another name.`,
    };
  }

  // A bot that is already there is not a failure: the earlier attempt may have
  // finished on the server while the app was closed, so hand it back instead of
  // dead-ending on "already exists". The build script answers EXISTS for that,
  // so both cases cost the same single round trip.
  const encoded = Buffer.from(CREATE_BOT_SCRIPT, 'utf8').toString('base64');
  const remoteScript = `/tmp/hermesbot-create-${name}.sh`;
  const command = [
    'set -u',
    `printf %s ${shellQuote(encoded)} | base64 -d > ${remoteScript}`,
    `bash ${remoteScript} ${shellQuote(name)} ${shellQuote(title)} ${shellQuote(description)} ${shellQuote(color)} ${shellQuote(shape)}`,
    `rm -f ${remoteScript}`,
  ].join('\n');

  const result = await runHostCommand(connection, command, 60000);
  const line =
    result.stdout
      .split('\n')
      .map((entry) => entry.trim())
      .find(
        (entry) =>
          entry.startsWith('OK ') ||
          entry.startsWith('EXISTS') ||
          entry.startsWith('ERR '),
      ) || '';

  if (line.startsWith('OK ')) {
    const { created, meta } = parseCreateOutcome(line);
    const profile = created || name;
    // The build mints a fresh API_SERVER_KEY: drop any key cached for this name.
    profileKeys.delete(profile);
    // The bot is on the host: it is made. Whether the gateway serves it yet is
    // another question, and one nobody has to wait for here — the profile is
    // served at Hermes' next rescan, or at once if the gateway can be asked.
    // The app asks in the background and says which of the two it is.
    const served = await botServed(profile);
    if (!served) startWarming(profile);
    return {
      ok: true,
      name: profile,
      title: meta.title || title || name,
      color: meta.color,
      served,
    };
  }

  if (line.startsWith('EXISTS')) {
    // The colour Hermes already shows wins. We only write one when the person
    // picked it here, so opening a bot never repaints it behind their back.
    const adopter = Buffer.from(ADOPT_BOT_META_PYTHON, 'utf8').toString('base64');
    const adopted = await runHostCommand(
      connection,
      [
        `printf %s ${shellQuote(adopter)} | base64 -d > /tmp/hermesbot-adopt-${name}.py`,
        `HERMES_BOT_PROFILE="$HOME/.hermes/profiles/${name}/profile.yaml" python3 /tmp/hermesbot-adopt-${name}.py ${shellQuote(title)} ${shellQuote(color)}`,
        `rm -f /tmp/hermesbot-adopt-${name}.py`,
      ].join('\n'),
    );
    let before = { title: '', color: '' };
    try {
      const parsed = JSON.parse(adopted.stdout.trim().split('\n').pop() || '{}');
      before = {
        title: String(parsed.title || ''),
        color: String(parsed.color || ''),
      };
    } catch {
      before = { title: '', color: '' };
    }
    // A bot that was already there is served the same way a new one is: the
    // gateway may still be holding its adapters for it.
    const served = await botServed(name);
    if (!served) startWarming(name);
    return {
      ok: true,
      name,
      title: before.title || title || name,
      color: before.color,
      exists: true,
      served,
    };
  }

  if (line.startsWith('ERR ')) {
    // One line, always: a python traceback belongs in the log, not in a dialog.
    return {
      ok: false,
      error: line.slice(4).trim().slice(0, 240) || 'Could not create the bot',
    };
  }

  return {
    ok: false,
    error:
      result.error ||
      stderrOf(result) ||
      `Could not create the bot on ${connection.sshHost}`,
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 520,
    show: false,
    backgroundColor: '#1b1b1d',
    title: 'Hermes Bot',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // The dictation needs the microphone, and only the dictation asks for it.
  // Everything else the window could ask for is denied.
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture');
    },
  );
  win.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) =>
      permission === 'media' || permission === 'audioCapture',
  );

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

function shutdown() {
  stopTunnel();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    shutdown();
    app.quit();
  });
}

app.on('will-quit', shutdown);

app.whenReady().then(() => {
  reapOrphanTunnel();
  buildMenu();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
  }
  createWindow();
  if (storedConnection().autoConnect && storedApiKey()) {
    connectNow().catch(() => undefined);
  }
  // The update test presses the button itself: it asks the launch to leave
  // the looking for the update to that hand alone.
  if (!process.argv.includes('--no-update-on-launch')) updater.checkInBackground();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('before-quit', stopTunnel);

// The new version waits for the app to close: quitting is the moment the
// update takes over.
app.on('before-quit', () => {
  updater.installOnQuit();
});

app.on('window-all-closed', () => {
  stopTunnel();
  if (process.platform !== 'darwin') app.quit();
});
