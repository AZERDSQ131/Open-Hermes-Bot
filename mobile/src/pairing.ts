/**
 * The pairing code's own grammar: eight characters from an alphabet with no
 * I, O, 0 or 1 — the bridge prints them in two groups of four, and a person
 * should not have to type the dash.
 */

export const PAIRING_LENGTH = 8;

/** The characters the bridge can mint. Everything else is a slip. */
const ALPHABET = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

/** What the person meant: capitals, no dash, no spaces, at most eight. */
export function normalizePairingCode(value: string): string {
  return (value.toUpperCase().match(ALPHABET) ?? []).join('').slice(0, PAIRING_LENGTH);
}

/** The code as the bridge mints it: `ABCD-EFGH`. */
export function canonicalPairingCode(value: string): string {
  const raw = normalizePairingCode(value);
  if (raw.length !== PAIRING_LENGTH) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function pairingCodeReady(value: string): boolean {
  return normalizePairingCode(value).length === PAIRING_LENGTH;
}

/** The address of a bridge, as the person meant it: HTTPS, no trailing slash. */
export function normalizeBridgeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return '';
  return url.replace(/\/+$/, '');
}

/** The one thing the desktop hands the phone: both halves of a pairing. */
export type PairingLink = { url: string; code: string };

/**
 * The link the desktop window draws as a QR (`hermesbot://pair?url=…&code=…`),
 * and the same two halves pasted from a terminal on two lines.
 */
const LINK_PREFIX = /^hermes-?bot:\/\/pair\?/i;

function decoded(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * What the camera read, or what was pasted, as an address and a code. Anything
 * that is not both is not a pairing: the fields keep what the person typed.
 */
export function parsePairingLink(value: string): PairingLink | null {
  const text = value.trim();
  if (!text) return null;

  if (!LINK_PREFIX.test(text)) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;
    const url = normalizeBridgeUrl(lines[0]);
    const code = normalizePairingCode(lines[1]);
    return url && code.length === PAIRING_LENGTH ? { url, code } : null;
  }

  const fields = new Map<string, string>();
  for (const part of text.replace(LINK_PREFIX, '').split('&')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    fields.set(decoded(part.slice(0, at)).toLowerCase(), decoded(part.slice(at + 1)));
  }

  const url = normalizeBridgeUrl(fields.get('url') ?? '');
  const code = normalizePairingCode(fields.get('code') ?? '');
  if (!url || code.length !== PAIRING_LENGTH) return null;
  return { url, code };
}
