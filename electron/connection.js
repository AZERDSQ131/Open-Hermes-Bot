// The rules of the two connections.
//
// Hermes can run on the machine the app runs on, or on another one, reached
// over SSH. Which one it is decides everything: the address the app talks
// to, the way the commands reach the host, and what the person is told about
// where their agent lives.
//
// The rules live here, in one file, so the bridge and its tests cannot
// disagree about them.

'use strict';

/** Hermes runs on this machine: no tunnel, no SSH. */
const LOCAL = 'local';

/** Hermes runs somewhere else: the app opens an SSH tunnel to it. */
const SSH = 'ssh';

/** The two ways Hermes can be reached. */
const MODES = [LOCAL, SSH];

/**
 * A mode the app understands. Anything else — including nothing at all — is
 * the old one: the tunnel. A person who never chose is not on a broken
 * setting, they are on the setting they had.
 */
function normalizeMode(value) {
  return value === LOCAL ? LOCAL : SSH;
}

/**
 * The mode a stored record really means.
 *
 * A record written before the modes existed carries a host and no mode: that
 * is a machine elsewhere, and it keeps working. A record with neither is a
 * fresh install, and the person has not said anything yet — the setup asks,
 * and this Mac is the likelier answer.
 */
function resolveMode(stored) {
  const record = stored || {};
  if (record.mode === LOCAL || record.mode === SSH) return record.mode;
  return String(record.sshHost ?? '').trim() ? SSH : LOCAL;
}

/**
 * Whether the person has already said where Hermes is.
 *
 * The setup asks this question once. A record with a mode has been answered;
 * a record with a host has been answered too, the way it was answered before
 * the modes existed.
 */
function isConfigured(stored) {
  const record = stored || {};
  if (record.mode === LOCAL || record.mode === SSH) return true;
  return Boolean(String(record.sshHost ?? '').trim());
}

/**
 * The address of the Hermes API.
 *
 * On this machine the API is the port itself. On another one it is the port
 * the tunnel forwards to, and the forward is what keeps the key on this side.
 */
function apiBaseUrl(mode, ports) {
  const settings = ports || {};
  const port = mode === LOCAL ? settings.apiPort : settings.localPort;
  return `http://127.0.0.1:${port}`;
}

/**
 * One call to the Hermes API, under the prefix of the profile it is about —
 * `/p/<profile>` — so a bot's turn is served by that bot's own gateway and
 * checked against that bot's own key.
 */
function apiUrl(baseUrl, profile, pathname) {
  const prefix = profile ? `/p/${encodeURIComponent(profile)}` : '';
  return `${baseUrl}${prefix}${pathname}`;
}

/**
 * What the person is told about where Hermes is: the name of the machine
 * they chose, or the one they are on.
 */
function connectionLabel(mode, sshHost) {
  if (mode === LOCAL) return 'This Mac';
  return String(sshHost ?? '').trim();
}

/**
 * The hosts an SSH config already knows about.
 *
 * The person has named their machines once, in `~/.ssh/config`, and the
 * setup reads that list rather than asking for the same names again.
 * Patterns — `*` and `?` — stand for many machines, so they are not a
 * machine; a name that starts with `!` only says what a pattern should
 * leave out. Comments and blank lines say nothing.
 */
function sshConfigHosts(text) {
  const hosts = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    // A comment runs to the end of the line, wherever it starts.
    const line = raw.replace(/#.*/, '').trim();
    const match = /^host\s+(.+)$/i.exec(line);
    if (!match) continue;
    for (const name of match[1].split(/\s+/)) {
      if (name.includes('*') || name.includes('?')) continue;
      if (name.startsWith('!')) continue;
      hosts.add(name);
    }
  }
  return [...hosts];
}

module.exports = {
  LOCAL,
  SSH,
  MODES,
  normalizeMode,
  resolveMode,
  isConfigured,
  apiBaseUrl,
  apiUrl,
  connectionLabel,
  sshConfigHosts,
};
