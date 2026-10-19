// A bot's colour has to be the same one Hermes itself shows for that profile,
// otherwise the same bot wears two different colours in the two apps.
//
// Hermes derives it from the profile name (apps/desktop/src/lib/profile-color.ts
// + plugins/hermes-bots/avatar.tsx): hash the name with a 31-multiplier, take it
// modulo 360 for the hue, and paint it at 68% saturation / 58% lightness. An
// explicit colour stored in the profile's bot metadata always wins. Keep this
// file byte-for-byte faithful to that behaviour; it is the whole contract.

const PROFILE_TAG_SATURATION = 68;
const PROFILE_TAG_LIGHTNESS = 58;

/** The friendly violet the primary profile wears, and the last resort. */
export const PRIMARY_AVATAR_COLOR = '#8b5cf6';

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

/**
 * The stable colour Hermes gives a named profile, or null for the primary
 * profile (`default`) and drafts with no name yet.
 */
export function profileColor(name: null | string | undefined): null | string {
  const key = (name ?? '').trim();

  if (!key || key === 'default') return null;

  return `hsl(${hashString(key) % 360} ${PROFILE_TAG_SATURATION}% ${PROFILE_TAG_LIGHTNESS}%)`;
}

/** A colour stored on the profile wins; otherwise the name's own hue. */
export function avatarColor(
  stored: null | string | undefined,
  name: null | string | undefined,
): string {
  return stored?.trim() || profileColor(name) || PRIMARY_AVATAR_COLOR;
}
