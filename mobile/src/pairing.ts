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
