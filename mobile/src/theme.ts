import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';


/**
 * The app's palette and geometry, taken from the mockup (mockups/mobile.css)
 * and the desktop app's own tokens (src/styles.css). One place, so a screen
 * never invents a colour.
 */

export const C = {
  bg: '#1d1d1f',
  sidebar: '#19191b',
  divider: 'rgba(255,255,255,0.07)',
  hover: 'rgba(255,255,255,0.04)',
  active: '#27272a',
  field: '#262628',
  field2: '#353539',
  bubble: '#29292c',
  bean: '#303036',
  paper: '#f2efe5',
  text: '#f3f3f5',
  text2: '#9a9aa1',
  text3: '#6f6f76',
  green: '#3ecf8e',
  blue: '#2496e8',
  red: '#ff5f57',
  sheet: '#232326',
  sheet2: '#2b2b2f',
  card: '#2a2a2e',
  cardRaised: '#242427',
  line: 'rgba(255,255,255,0.075)',
  hairline: 'rgba(255,255,255,0.055)',
} as const;

/** The grey a body of text is allowed to be, from title to hint. */
export const INK = {
  title: '#f0f0f2',
  body: '#f1f1f3',
  quiet: '#87878e',
  quiet2: '#8c8c93',
  label: '#6f6f76',
  faint: '#74747b',
  meta: '#818188',
  onPaper: '#1c1b19',
} as const;

/** The ios system font: the mockup asks for -apple-system, and this is it. */
export const FONT = {
  regular: undefined,
} as const;

/**
 * The mockup was drawn at 360 points wide, with type down to 9. On a phone
 * that reads as a footnote, so every screen is scaled once, here: the body
 * text by nearly half again, the display type by less (a 27 point title does
 * not need the same boost as an 11 point preview), every box by a quarter.
 */
const TEXT_SCALE = 1.48;
const BOX_SCALE = 1.26;

/**
 * Below 16 points the full increase; above it, a smaller share, so a title
 * grows by a third instead of by half and still fits beside its button.
 */
function textFactor(size: number): number {
  if (size <= 0) return TEXT_SCALE;
  if (size <= 16) return TEXT_SCALE;
  return 1 + (TEXT_SCALE - 1) * Math.max(0.55, 16 / size);
}

const TEXT_SIZE = /^(fontSize|lineHeight|letterSpacing)$/;
const BOX_SIZE =
  /^(width|height|minWidth|minHeight|maxWidth|maxHeight|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|top|bottom|left|right)$/;

function scaled(key: string, value: unknown): unknown {
  if (typeof value !== 'number') return value;
  if (TEXT_SIZE.test(key)) return Math.round(value * textFactor(value) * 10) / 10;
  if (BOX_SIZE.test(key)) return Math.round(value * BOX_SCALE);
  return value;
}

/**
 * StyleSheet.create, with the scale applied. Percentages are left alone — a
 * width of "78%" is already a share of the screen, not a number of points.
 */
export function createStyles<
  T extends Record<string, ViewStyle | TextStyle | ImageStyle>,
>(styles: T): T {
  const out: Record<string, ViewStyle | TextStyle | ImageStyle> = {};
  for (const [name, style] of Object.entries(styles)) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) next[key] = scaled(key, value);
    out[name] = next as ViewStyle;
  }
  return StyleSheet.create(out) as T;
}

/** A face or an icon, scaled by the same box factor the layout uses. */
export function box(pts: number): number {
  return Math.round(pts * BOX_SCALE);
}
