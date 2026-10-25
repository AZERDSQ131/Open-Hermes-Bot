// The key of the host, and the moment it stops being the key.
//
// Hermes answers with the key that sits in its own home (`~/.hermes/.env`,
// API_SERVER_KEY). The app keeps one in the Keychain, and that copy is the
// only thing it holds about the door. Copies go stale: the key is rotated,
// Hermes is reinstalled, or a key read from this Mac is still in the pocket
// when the person points the app at another machine — and then every call
// answers 401 with nothing to act on.
//
// The rules here are the ones that make a refusal recoverable: where a key
// came from, whether it still belongs to the machine the app is talking to,
// when the host's own key may be adopted, and what the person is told when
// neither works.
//
// The rules live in one file, so the bridge and its tests cannot disagree.

'use strict';

/** A Hermes key is long; anything shorter is a read that went wrong. */
const MIN_KEY_LENGTH = 16;

/** A key as the shell hands it over: one line, maybe quoted, maybe padded. */
function envKey(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/);
  const line = lines.find((entry) => entry.trim());
  if (!line) return '';
  return stripQuotes(line.trim()).trim();
}

/** The person may have written the key with quotes around it. */
function stripQuotes(value) {
  const quotes = ['"', "'"];
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if (quotes.includes(first) && last === first) return value.slice(1, -1);
  return value;
}

/** A key that looks like one, rather than the wreckage of a failed read. */
function plausibleKey(key) {
  return String(key ?? '').trim().length >= MIN_KEY_LENGTH;
}

/**
 * Where a key came from: the machine whose Hermes home it was read in. A key
 * typed by hand has no origin — the person vouched for it, and the app does
 * not second-guess that.
 */
function keyOrigin(connection) {
  const at = connection || {};
  const local = at.mode === 'local';
  return {
    mode: local ? 'local' : 'ssh',
    sshHost: local ? '' : String(at.sshHost ?? '').trim(),
  };
}

/**
 * Does the key in the pocket belong to the machine the app is about to talk
 * to? A key from before the origins were written down could belong anywhere:
 * it is given the benefit of the doubt, and a refusal will settle it.
 */
function originMatches(origin, connection) {
  if (!origin) return true;
  const now = keyOrigin(connection);
  const then = keyOrigin(origin);
  if (then.mode !== now.mode) return false;
  if (now.mode === 'local') return true;
  return then.sshHost.toLowerCase() === now.sshHost.toLowerCase();
}

/**
 * The key that should replace a refused one: the machine's own key, and only
 * if the machine accepted it. Nothing is adopted on a promise — a key that
 * fails too would leave the app exactly where it was, minus the old one.
 */
function adoptHostKey({ stored, hostKey, accepted }) {
  if (!accepted) return '';
  const candidate = String(hostKey ?? '').trim();
  if (!plausibleKey(candidate)) return '';
  if (candidate === String(stored ?? '').trim()) return '';
  return candidate;
}

/** What the person reads, and what the host is called in it. */
function hostName(connection) {
  const at = keyOrigin(connection);
  return at.mode === 'local' ? 'this Mac' : at.sshHost || 'the host';
}

/**
 * A refusal with no host in it is a dead end. The sentence names the machine,
 * and the one thing that can be done about it.
 */
function refusalMessage(connection, options) {
  const label = hostName(connection);
  const at = keyOrigin(connection);
  const where = at.mode === 'local' ? 'on this Mac' : `on ${label}`;
  if (options?.hostKeyFound && options?.hostKeyDiffers) {
    return `The key was refused by ${label}. The Hermes home ${where} holds another one — read the key again.`;
  }
  if (options?.hostKeyFound) {
    return `The key in the Hermes home ${where} was refused too. Check API_SERVER_KEY in ~/.hermes/.env.`;
  }
  return `The key was refused by ${label}. Read the key from ${label} again in Settings → Connection.`;
}

module.exports = {
  MIN_KEY_LENGTH,
  envKey,
  stripQuotes,
  plausibleKey,
  keyOrigin,
  originMatches,
  adoptHostKey,
  hostName,
  refusalMessage,
};
