const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  safeStorage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

app.setName('Sidekick');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// The live tunnel forwards a configurable local port; a connection test uses
// a neighbouring port on a throwaway tunnel that is never persisted.
const TUNNEL_TIMEOUT_MS = 15000;
const DEFAULT_CONNECTION = {
  sshHost: 'jetson',
  apiPort: 8642,
  localPort: 18742,
  autoConnect: false,
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

function encryptSecret(value) {
  if (!value) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return {
      scheme: 'safeStorage',
      value: safeStorage.encryptString(value).toString('base64'),
    };
  }
  return { scheme: 'plain', value };
}

function decryptSecret(record) {
  if (!record || typeof record.value !== 'string') return '';
  if (record.scheme === 'safeStorage') {
    try {
      return safeStorage.decryptString(Buffer.from(record.value, 'base64'));
    } catch {
      return '';
    }
  }
  return record.value;
}

function storedApiKey() {
  return decryptSecret(readStore().secret);
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

  const store = readStore();
  let secret = store.secret ?? null;
  if (payload?.clearKey) secret = null;
  if (typeof payload?.apiKey === 'string' && payload.apiKey.trim()) {
    secret = encryptSecret(payload.apiKey.trim());
  }

  writeStore({
    connection: { sshHost: host, apiPort: port, localPort, autoConnect },
    secret,
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
  const store = readStore();
  writeStore({ ...store, secret: encryptSecret(key) });
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

tmp = path.with_name(path.name + ".sidekick-tmp")
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
    tmp = path.with_name(path.name + ".sidekick-tmp")
    tmp.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
    os.replace(tmp, path)

print(json.dumps({"title": now_title, "color": now_color}, separators=(",", ":")))
`;

// A bot IS a Hermes profile: a directory under ~/.hermes/profiles carrying the
// files that make it one. Hermes lists any directory with a config.yaml,
// profile.yaml, .env or SOUL.md in it, and the multiplexed gateway starts
// serving it as soon as the directory is there — measured: reachable on the
// first request after the rename.
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
STAGING="$ROOT/profiles/.$NAME.staging-sidekick"

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

# Deliberately no readiness probe here: the gateway needs ~15 s to notice a
# new profile and start serving it, and waiting for that is what made the
# dialog sit there. The bot exists the moment the rename lands; Hermes picks it
# up on its next scan, exactly as it does for bots made in its own app.
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

ipcMain.handle('hermes:bot:create', async (_event, payload) => {
  const connection = storedConnection();
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
  const remoteScript = `/tmp/sidekick-create-${name}.sh`;
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
        `printf %s ${shellQuote(adopter)} | base64 -d > /tmp/sidekick-adopt-${name}.py`,
        `python3 /tmp/sidekick-adopt-${name}.py ${shellQuote(profilePath)} ${shellQuote(title)} ${shellQuote(color)}`,
        `rm -f /tmp/sidekick-adopt-${name}.py`,
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
    title: 'Sidekick',
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
