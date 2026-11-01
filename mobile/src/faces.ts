import type { BloubShape } from './bloubFrames';
import { COLORS, SHAPES } from './data';

/**
 * The faces the arc offers when a bot is being made: names, shapes and
 * colours drawn at random, so the choice starts from something to look at
 * rather than from an empty form. None of them is a bot yet — the one that
 * is picked is only a draft the create sheet is filled with.
 */
export type Suggested = {
  id: string;
  name: string;
  shape: BloubShape;
  color: string;
};

/** Short, pronounceable, and none of them already on this host. */
const NAMES = [
  'Binx',
  'Cove',
  'Dune',
  'Echo',
  'Fern',
  'Gale',
  'Halo',
  'Iris',
  'Juno',
  'Kite',
  'Lumen',
  'Mica',
  'Nimbus',
  'Onyx',
  'Quill',
  'Rune',
  'Sable',
  'Tide',
  'Vale',
  'Wisp',
  'Yarrow',
  'Zephyr',
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** A fresh arc, every time it opens: the same name never comes twice. */
export function suggestFaces(count = 18): Suggested[] {
  const pool = [...NAMES];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.min(count, pool.length)).map((name, index) => ({
    id: `face-${index}`,
    name,
    shape: pick(SHAPES).id,
    color: pick(COLORS),
  }));
}
