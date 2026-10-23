// The rules of a connection that is not the portal's.
//
// A service the host already knows — the sixty-odd entries of the local MCP
// catalogue — is connected on the host itself: the entry is installed there,
// and the provider authorizes its own browser flow. No Nous account is
// involved, so nothing here asks the portal anything.
//
// The shell runs the host's own command and reads what it prints. Two things
// come out of that text, and they are the only things this file knows how to
// find: the link to open, and the loopback port the provider comes back to.
// The rules live here, apart from the shell, so they are covered to the line.

'use strict';

/** The URL the host prints for the person to open. */
const URL_IN_TEXT = /https:\/\/[^\s"'<>]+/g;

/** The port in `redirect_uri`, encoded or not, on the loopback of the host. */
const CALLBACK_PORT =
  /redirect_uri=https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)/i;

/**
 * The authorization link in what the host printed.
 *
 * The output carries documentation links too, so the one kept is the one
 * that names a callback: that is the OAuth authorization URL and nothing
 * else.
 */
function authUrlIn(text) {
  const found = String(text ?? '').match(URL_IN_TEXT) || [];
  return found.find((url) => /[?&]redirect_uri=/.test(url)) || '';
}

/**
 * The port the provider redirects to, on the machine that runs Hermes.
 *
 * The shell forwards it while the flow waits, so the browser on this Mac can
 * hand the authorization back to the host. `0` means the link did not say.
 */
function callbackPort(url) {
  const raw = String(url ?? '');
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // A link that cannot be decoded is still a link: read it as it came.
  }
  const match = CALLBACK_PORT.exec(text);
  const port = Number.parseInt(match?.[1] ?? '', 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return 0;
  return port;
}

/**
 * What the host's login command said, in one answer.
 *
 * The command exits zero even when the provider refused the flow, so the
 * success is the word it prints when a token landed. Everything else is the
 * reason it printed, kept for the page.
 */
function loginOutcome(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => /\bAuthenticated\b/.test(line))) {
    return { ok: true, error: '' };
  }
  const failed = lines.filter((line) =>
    /(Authentication failed|✗|Error:|error:)/i.test(line),
  );
  const last = failed[failed.length - 1] ?? '';
  return {
    ok: false,
    error:
      last.replace(/^[✗\s]+/, '').replace(/^Error:\s*/i, '').trim() ||
      'The authorization did not complete.',
  };
}

module.exports = { authUrlIn, callbackPort, loginOutcome };
