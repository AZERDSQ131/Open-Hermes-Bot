const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

app.setName('Grok Bot');

// The official Grok desktop app already owns ~/Library/Application Support/Grok
// Bot, and two Electron apps sharing a userData folder fight over Chromium's
// singleton lock: the second one silently hands its window to the first. This
// app keeps its own folder, next to the official one, and never collides.
app.setPath(
  'userData',
  path.join(app.getPath('appData'), 'Grok Bot Desktop'),
);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// The live tunnel forwards a configurable local port; a connection test uses
// a neighbouring port on a throwaway tunnel that is never persisted.
const TUNNEL_TIMEOUT_MS = 15000;
const DEFAULT_CONNECTION = {
  sshHost: 'jetson',
  apiPort: 8642,
  localPort: 18742,
  // A stored key is an intent to be connected: starting disconnected only
  // produced "not connected" on the first message. Settings can opt out.
  autoConnect: true,
};

let connectionStatus = { state: 'disconnected' };
let tunnel = null;
let tunnelError = '';

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

function storedConnection() {
  const store = readStore();
  const connection = store.connection || {};
  return { ...DEFAULT_CONNECTION, ...connection };
}

// The Hermes API key lives in the login Keychain, under this app's own
// service. safeStorage would name the item after the app — and the official
// Grok desktop app already owns "Grok Bot Safe Storage" — which turns every
// read into a Keychain prompt and puts our key behind another app's item.
// The `security` tool writes an item it can read back without a prompt, so
// the key stays in the Keychain and belongs to nobody else.
const KEYCHAIN_SERVICE = 'Grok Bot';
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
  const written = security([
    'add-generic-password',
    '-U',
    '-a',
    KEYCHAIN_ACCOUNT,
    '-s',
    KEYCHAIN_SERVICE,
    '-w',
    secret,
  ]);
  return written !== '';
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
    sshHost: connection.sshHost,
    apiPort: connection.apiPort,
    localPort: connection.localPort,
    autoConnect: Boolean(connection.autoConnect),
    hasKey: Boolean(storedApiKey()),
  };
}

// The live tunnel owns `localPort`; the probe uses the next free slot so a
// connection test never collides with a tunnel that is already running.
function testPortFor(localPort) {
  return localPort >= 65535 ? localPort - 1 : localPort + 1;
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
    return { ok: false, status: 0, error: error.message };
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
          state?.stderr.trim() ||
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

function statusFromProbe(probe, sshHost) {
  if (probe.ok) {
    const body = probe.body ?? {};
    return {
      state: 'connected',
      version: body.version,
      platform: body.platform,
      gateway: body.gateway_state,
      sshHost,
    };
  }
  if (probe.status === 401) {
    return {
      state: 'error',
      message: 'API key rejected by the Hermes API server',
    };
  }
  return {
    state: 'error',
    message: probe.error || tunnelError || `HTTP ${probe.status || '?'}`,
  };
}

function runSsh(host, command, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const child = spawn(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: 'SSH command timed out' });
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
  const host = sanitizeHost(payload?.sshHost);
  const port = sanitizePort(payload?.apiPort);
  if (!host) return { ok: false, error: 'Invalid SSH host' };
  if (!port) return { ok: false, error: 'Invalid API port' };

  const current = storedConnection();
  const localPort =
    payload?.localPort === undefined
      ? current.localPort
      : sanitizePort(payload.localPort);
  if (!localPort) return { ok: false, error: 'Invalid local tunnel port' };
  if (localPort === port) {
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

  writeStore({
    connection: { sshHost: host, apiPort: port, localPort, autoConnect },
  });
  return { ok: true, settings: publicSettings() };
});

ipcMain.handle('hermes:key:import', async (_event, payload) => {
  const host = sanitizeHost(payload?.sshHost) || storedConnection().sshHost;
  const result = await runSsh(
    host,
    'grep -m1 -E \'^API_SERVER_KEY=\' "$HOME/.hermes/.env" 2>/dev/null | cut -d= -f2-',
  );
  if (!result.ok || !result.stdout.trim()) {
    return {
      ok: false,
      error:
        result.error ||
        result.stderr.trim() ||
        'API_SERVER_KEY not found in the remote ~/.hermes/.env',
    };
  }
  const key = parseEnvValue(result.stdout);
  if (key.length < 16) return { ok: false, error: 'Imported key looks invalid' };
  storeSecret(key);
  return { ok: true, keyLength: key.length };
});

async function connectNow() {
  const connection = storedConnection();
  const apiKey = storedApiKey();
  if (!apiKey) {
    return setStatus({ state: 'error', message: 'No API key configured' });
  }

  setStatus({ state: 'connecting' });
  reapOrphanTunnel();
  const state = startLiveTunnel(connection);
  const probe = await waitForTunnel(state, apiKey);
  return setStatus(statusFromProbe(probe, connection.sshHost));
}

ipcMain.handle('hermes:connect', () => connectNow());

// Probe unsaved values on a throwaway tunnel: nothing is persisted and an
// already-connected app keeps its own tunnel untouched.
ipcMain.handle('hermes:test', async (_event, payload) => {
  const host = sanitizeHost(payload?.sshHost);
  const port = sanitizePort(payload?.apiPort);
  if (!host) return { state: 'error', message: 'Invalid SSH host' };
  if (!port) return { state: 'error', message: 'Invalid API port' };
  const typedKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
  const apiKey = typedKey || storedApiKey();
  if (!apiKey) {
    return { state: 'error', message: 'Enter the API key or import it first' };
  }
  const ephemeral = spawnTunnel(
    { sshHost: host, apiPort: port },
    testPortFor(storedConnection().localPort),
  );
  try {
    const probe = await waitForTunnel(ephemeral, apiKey);
    return statusFromProbe(probe, host);
  } finally {
    killTunnel(ephemeral);
  }
});

ipcMain.handle('hermes:disconnect', () => {
  stopTunnel();
  return setStatus({ state: 'disconnected' });
});

ipcMain.handle('hermes:status', () => connectionStatus);

// ------------------------------------------------------------------ chat

// Everything below rides the live SSH tunnel: 127.0.0.1:<localPort> on this
// machine *is* the Hermes API server on the other one, so the key never leaves
// the app and nothing new needs to be exposed.
function apiUrl(localPort, profile, pathname) {
  const prefix = profile ? `/p/${encodeURIComponent(profile)}` : '';
  return `http://127.0.0.1:${localPort}${prefix}${pathname}`;
}

// The app can be opened with no tunnel (auto-connect off, or the server was
// asleep). Any request that needs Hermes tries once to connect instead of
// answering "not connected" to someone who never asked to be offline.
let lastConnectAttempt = 0;

async function ensureConnected() {
  if (tunnel) return true;
  if (Date.now() - lastConnectAttempt < 5000) return false;
  lastConnectAttempt = Date.now();
  await connectNow().catch(() => undefined);
  return Boolean(tunnel);
}

function liveTunnelOrError() {
  if (!tunnel) {
    return { error: 'Not connected to Hermes — open Settings and connect first.' };
  }
  const apiKey = storedApiKey();
  if (!apiKey) return { error: 'No API key configured — import it in Settings.' };
  return { localPort: tunnel.localPort, apiKey };
}

// Every profile mints its own API_SERVER_KEY when it is created, and the
// gateway checks /p/<name>/ against THAT key: a bot's turns cannot ride the
// primary profile's key. Keys are read from the profile's .env over the SSH
// connection the app already has, then kept for the rest of the session.
const profileKeys = new Map();

async function apiKeyFor(profile) {
  const stored = storedApiKey();
  if (!profile || profile === 'default') return stored;
  if (profileKeys.has(profile)) return profileKeys.get(profile);
  if (!PROFILE_NAME_RE.test(profile)) return stored;
  const result = await runSsh(
    storedConnection().sshHost,
    `grep -m1 '^API_SERVER_KEY=' "$HOME/.hermes/profiles/${profile}/.env" | cut -d= -f2-`,
    15000,
  );
  const key = String(result.stdout ?? '').trim().split('\n')[0].trim();
  if (!key) return stored;
  profileKeys.set(profile, key);
  return key;
}

async function apiCall(pathname, { method = 'GET', body, profile, timeoutMs = 30000 } = {}) {
  if (!tunnel) await ensureConnected();
  const live = liveTunnelOrError();
  if (live.error) return { ok: false, status: 0, error: live.error };
  const apiKey = await apiKeyFor(profile);
  if (!apiKey) return { ok: false, status: 0, error: 'No API key configured — import it in Settings.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(live.localPort, profile, pathname), {
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
  const title = String(payload?.title ?? '').slice(0, 120) || 'Grok Bot';
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
        # The same ui_meta block the Hermes desktop app reads for the name and
        # colour it paints this bot with.
        try:
            import yaml
            meta = home / "profiles" / name / "profile.yaml"
            data = yaml.safe_load(meta.read_text()) or {}
            bots = (data.get("ui_meta") or {}).get("hermes-bots") or {}
            title = str(bots.get("title") or "")
            color = str(bots.get("color") or "")
        except Exception:
            pass
        profiles.append({"name": name, "title": title, "color": color})
    print(json.dumps({"ok": True, "profiles": profiles}))
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
    });
  }
  return [...seen.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

ipcMain.handle('hermes:profiles', async () => {
  const host = storedConnection().sshHost;
  const live = await runSsh(
    host,
    `python3 - <<'PY'\n${LIST_PROFILES_PY}PY`,
    20000,
  );
  const answer = lastJsonObject(live.stdout);
  if (live.ok && answer?.ok && Array.isArray(answer.profiles)) {
    return {
      ok: true,
      source: 'gateway',
      profiles: cleanProfiles(answer.profiles),
    };
  }

  const disk = await runSsh(host, LIST_PROFILES_SH, 15000);
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
  if (!tunnel) await ensureConnected();
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
      apiUrl(live.localPort, payload?.profile, `/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`),
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
ui["hermes-bots"] = bots
data["ui_meta"] = ui

tmp = path.with_name(path.name + ".grokbot-tmp")
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

path = pathlib.Path(sys.argv[1])
title = sys.argv[2].strip()
color = sys.argv[3].strip()

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
    tmp = path.with_name(path.name + ".grokbot-tmp")
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
P="$ROOT/profiles/$NAME"
STAGING="$ROOT/profiles/.$NAME.staging-grokbot"

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

python3 - "$STAGING/profile.yaml" "$TITLE" "$COLOR" "$DESC" <<'PY'
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
    request_serve_profile_hot(root, sys.argv[2], timeout=3.0)
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
  if (!tunnel) {
    await ensureConnected();
  }
  if (!tunnel) {
    return {
      ok: false,
      error: 'Not connected to Hermes — connect in Settings, then create the bot.',
    };
  }
  const name = String(payload?.name ?? '').trim().toLowerCase();
  const title = String(payload?.title ?? '').trim();
  const description = String(payload?.description ?? '').trim();
  const color = sanitizeBotColor(payload?.color);

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
  const remoteScript = `/tmp/grokbot-create-${name}.sh`;
  const command = [
    'set -u',
    `printf %s ${shellQuote(encoded)} | base64 -d > ${remoteScript}`,
    `bash ${remoteScript} ${shellQuote(name)} ${shellQuote(title)} ${shellQuote(description)} ${shellQuote(color)}`,
    `rm -f ${remoteScript}`,
  ].join('\n');

  const result = await runSsh(connection.sshHost, command, 60000);
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
    const profilePath = `$HOME/.hermes/profiles/${name}/profile.yaml`;
    const adopter = Buffer.from(ADOPT_BOT_META_PYTHON, 'utf8').toString('base64');
    const adopted = await runSsh(
      connection.sshHost,
      [
        `printf %s ${shellQuote(adopter)} | base64 -d > /tmp/grokbot-adopt-${name}.py`,
        `python3 /tmp/grokbot-adopt-${name}.py ${shellQuote(profilePath)} ${shellQuote(title)} ${shellQuote(color)}`,
        `rm -f /tmp/grokbot-adopt-${name}.py`,
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
      result.stderr.trim() ||
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
    title: 'Grok Bot',
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
  win.webContents.on('console-message', (...args) => {
    console.log('[renderer]', args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', stopTunnel);

app.on('window-all-closed', () => {
  stopTunnel();
  if (process.platform !== 'darwin') app.quit();
});
