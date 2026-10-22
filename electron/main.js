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
function runProcess(command, args, timeoutMs, input, timeoutMessage) {
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
        stdout: stdout.slice(0, 8000),
        stderr: stderr.slice(0, 2000),
      });
    });
  });
}

function runSsh(host, command, timeoutMs = 20000, input) {
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
  );
}

// The same command, on this machine. The scripts are the same, the paths are
// the same: a Hermes that runs here keeps its home in the same place.
function runLocalCommand(command, timeoutMs = 20000, input) {
  return runProcess(
    '/bin/bash',
    ['-c', command],
    timeoutMs,
    input,
    'Command timed out',
  );
}

// A command on the machine that runs Hermes. On another machine it rides the
// SSH connection; on this one it is run here. Everything above this line
// asks for a command, not for a way to reach one.
function runHostCommand(connection, command, timeoutMs = 20000, input) {
  if (connection?.mode === 'local') {
    return runLocalCommand(command, timeoutMs, input);
  }
  return runSsh(connection?.sshHost, command, timeoutMs, input);
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

// The connectors of the host, read on the machine that runs Hermes.
//
// They are not on the API: they live behind the managed gateway, and the
// gateway needs the identity the host holds. So the script is run where
// Hermes is, with the same Python it uses, and it answers with plain JSON.
//
// With no argument it lists: the catalogue (what a connector is called), the
// toolkit (which ones the account may use) and the accounts (the ones that
// are connected). With a slug, it starts the connection and answers with the
// link the service wants the person to open.
const CONNECTORS_PYTHON = `import json
import os
import pathlib
import sys

root = pathlib.Path(os.path.expanduser("~/.hermes"))
sys.path.insert(0, str(root / "hermes-agent"))


def answer(ok, **extra):
    print(json.dumps({"ok": ok, **extra}, separators=(",", ":")))
    raise SystemExit(0)


def rows(items):
    return list(items) if isinstance(items, (list, tuple)) else []


try:
    from tools.connectors import connectors_available
    from tools.connectors.managed import managed_client
    from tools.connectors.portal.client import PortalConnectorClient
except Exception as exc:
    answer(False, available=False, connectors=[], error="Hermes' connectors are not here: %s" % exc)

slug = sys.argv[1] if len(sys.argv) > 1 else ""

try:
    available = bool(connectors_available())
except Exception:
    available = False

if not available:
    answer(
        True,
        available=False,
        connectors=[],
        message="The connectors are not available on this host.",
    )

# Connecting one: the host mints the link the service asks for.
if slug:
    try:
        from tools.connectors.account import find_or_start_operation, wait_for_prepare
        from tools.connectors.portal.errors import PortalConnectorUnavailable

        start = find_or_start_operation([slug], action="connect", profile_home=None)
        prepared = wait_for_prepare(start)
        snapshot = start.operation.snapshot()
        url = str(snapshot.get("connect_url") or "")
        if not prepared:
            answer(False, url="", error="The host could not start the connection.")
        answer(True, url=url)
    except Exception as exc:
        answer(False, url="", error=str(exc))

# Listing them: what is there, what may be used, and what is connected.
catalog = []
toolkit = []
accounts = []
try:
    client = PortalConnectorClient()
    client.require_authentication()
    for entry in rows(client.catalog().connectors):
        catalog.append({
            "slug": str(entry.slug),
            "name": str(entry.name or entry.slug),
            "description": str(entry.description or ""),
            "category": str(entry.category or ""),
            "logo": str(entry.logo_url or ""),
        })
    for account in rows(client.list_accounts()):
        accounts.append({
            "connector": str(account.get("connector") or ""),
            "status": str(account.get("status") or ""),
            "label": str(account.get("label") or ""),
            "active": bool(account.get("active")),
        })
except Exception as exc:
    answer(
        True,
        available=True,
        connectors=[],
        message="The connectors could not be read from the account: %s" % exc,
    )

try:
    for entry in rows(managed_client().list_connectors()):
        toolkit.append({
            "connector": str(entry.get("connector") or ""),
            "enabled": bool(entry.get("enabled", True)),
            "connected": bool(entry.get("connected", False)),
            "status": str(entry.get("connectionStatus") or ""),
        })
except Exception:
    # The toolkit is the account's own list: without it, the catalogue is
    # still worth showing.
    pass

answer(True, available=True, catalog=catalog, toolkit=toolkit, accounts=accounts)
`;

// The skills the host holds, and whether they are on. The list is Hermes'
// own: it knows what a skill is, where it came from and how often it was
// used.
ipcMain.handle('hermes:skills', async (_event, payload) => {
  const result = await apiCall('/api/skills', {
    profile: payload?.profile,
    timeoutMs: 20000,
  });
  if (!result.ok) {
    return {
      ok: false,
      skills: [],
      error: apiErrorText(result, 'The skills could not be read from the host'),
    };
  }
  return { ok: true, skills: Array.isArray(result.body) ? result.body : [] };
});

// A skill is turned on or off on the host, where the skill lives.
ipcMain.handle('hermes:skills:toggle', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim();
  if (!name) return { ok: false, error: 'A skill needs a name' };
  const result = await apiCall('/api/skills/toggle', {
    method: 'PUT',
    body: { name, enabled: Boolean(payload?.enabled) },
    profile: payload?.profile,
    timeoutMs: 20000,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'The skill could not be turned on or off'),
    };
  }
  return { ok: true, name, enabled: Boolean(payload?.enabled) };
});

// The toolsets the host offers: what a bot can use besides Hermes itself.
ipcMain.handle('hermes:toolsets', async (_event, payload) => {
  const result = await apiCall('/api/tools/toolsets', {
    profile: payload?.profile,
    timeoutMs: 20000,
  });
  if (!result.ok) {
    return {
      ok: false,
      toolsets: [],
      error: apiErrorText(result, 'The tools could not be read from the host'),
    };
  }
  return { ok: true, toolsets: Array.isArray(result.body) ? result.body : [] };
});

// A toolset is turned on or off on the host, where the tools live.
ipcMain.handle('hermes:toolsets:toggle', async (_event, payload) => {
  const name = String(payload?.name ?? '').trim();
  if (!name) return { ok: false, error: 'A tool needs a name' };
  const result = await apiCall(`/api/tools/toolsets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: { enabled: Boolean(payload?.enabled) },
    profile: payload?.profile,
    timeoutMs: 20000,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: apiErrorText(result, 'The tool could not be turned on or off'),
    };
  }
  return { ok: true, name, enabled: Boolean(payload?.enabled) };
});

// The connectors of the host: the services a bot can reach besides Hermes.
// They are not on the API — they live behind the managed gateway — so they
// are read on the machine that runs Hermes, the way the other things that
// are not on the API are read.
ipcMain.handle('hermes:connectors', async () => {
  const script = Buffer.from(CONNECTORS_PYTHON, 'utf8').toString('base64');
  const result = await runHostCommand(
    storedConnection(),
    [
      `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-connectors.py`,
      'python3 /tmp/hermesbot-connectors.py',
      'rm -f /tmp/hermesbot-connectors.py',
    ].join('\n'),
    45000,
  );
  if (!result.ok) {
    return {
      ok: false,
      available: false,
      catalog: [],
      toolkit: [],
      accounts: [],
      error:
        stderrOf(result) ||
        result.error ||
        'The connectors could not be read from the host',
    };
  }
  const answer = lastJsonObject(result.stdout);
  if (!answer) {
    return {
      ok: false,
      available: false,
      catalog: [],
      toolkit: [],
      accounts: [],
      error: 'The host did not answer with a list of connectors.',
    };
  }
  return {
    ok: Boolean(answer.ok),
    available: Boolean(answer.available),
    // The three lists the host answered with, as they came: the catalogue,
    // the toolkit of the account, and the accounts that are connected. The
    // app reads them together.
    catalog: Array.isArray(answer.catalog) ? answer.catalog : [],
    toolkit: Array.isArray(answer.toolkit) ? answer.toolkit : [],
    accounts: Array.isArray(answer.accounts) ? answer.accounts : [],
    message: typeof answer.message === 'string' ? answer.message : '',
    error: typeof answer.error === 'string' ? answer.error : '',
  };
});

// Connecting a connector is a question the host answers: it mints the link
// the service wants the person to open. The shell hands that link to the
// Mac, and nothing else.
ipcMain.handle('hermes:connectors:connect', async (_event, payload) => {
  const slug = String(payload?.slug ?? '').trim();
  if (!slug) return { ok: false, error: 'A connector needs a name' };
  const script = Buffer.from(CONNECTORS_PYTHON, 'utf8').toString('base64');
  const result = await runHostCommand(
    storedConnection(),
    [
      `printf %s ${shellQuote(script)} | base64 -d > /tmp/hermesbot-connectors.py`,
      `python3 /tmp/hermesbot-connectors.py ${shellQuote(slug)}`,
      'rm -f /tmp/hermesbot-connectors.py',
    ].join('\n'),
    60000,
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        stderrOf(result) ||
        result.error ||
        'The connection could not be started on the host',
    };
  }
  const answer = lastJsonObject(result.stdout);
  if (!answer?.ok) {
    return {
      ok: false,
      error:
        (typeof answer?.error === 'string' && answer.error) ||
        'The host could not start the connection.',
    };
  }
  return {
    ok: true,
    slug,
    url: typeof answer.url === 'string' ? answer.url : '',
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

async function apiCall(pathname, { method = 'GET', body, profile, timeoutMs = 30000 } = {}) {
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

// "OK <name> <metadata json>" from the script above.
function parseCreateOutcome(line) {
  const rest = line.slice(3).trim();
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

// Creating a bot only needs SSH, so it used to succeed while the app was not
// connected — the bot appeared in Hermes and the first message failed with
// "not connected". Creation now needs a live tunnel, and does not report
// success until the gateway answers for the profile.
async function waitForBotReady(name, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const probe = await apiCall('/api/sessions', { profile: name, timeoutMs: 4000 });
    if (probe.ok) return { ok: true };
    last = apiErrorText(probe, `HTTP ${probe.status || 0}`);
    if (probe.status === 401) return { ok: false, error: last };
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { ok: false, error: last || 'Hermes never answered for this profile' };
}

ipcMain.handle('hermes:bot:create', async (_event, payload) => {
  const connection = storedConnection();
  if (!isLive()) {
    await ensureConnected();
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
    // The build mints a fresh API_SERVER_KEY: drop any key cached for this name.
    profileKeys.delete(created || name);
    const ready = await waitForBotReady(created || name);
    if (!ready.ok) {
      return {
        ok: false,
        error: `“${created || name}” was created but Hermes does not answer for it: ${ready.error}.`,
      };
    }
    return {
      ok: true,
      name: created || name,
      title: meta.title || title || name,
      color: meta.color,
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
    return {
      ok: true,
      name,
      title: before.title || title || name,
      color: before.color,
      exists: true,
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
