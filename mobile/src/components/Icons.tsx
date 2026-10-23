import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { box, C } from '../theme';

/**
 * The marks the mockup draws inline: no icon font, no dependency, the same
 * strokes at the same weights.
 */

type IconProps = {
  size?: number;
  color?: string;
  width?: number;
};

const stroke = (color: string, width: number) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export function PlusIcon({ size = 17, color = '#e9e9ed' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.8)}>
      <Path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function SearchIcon({ size = 13, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 2)}>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20.4 20.4-4.1-4.1" />
    </Svg>
  );
}

export function BackIcon({ size = 18, color = '#a6a6ad' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.9)}>
      <Path d="M14.5 5 8 12l6.5 7" />
    </Svg>
  );
}

export function MoreIcon({ size = 18, color = '#a6a6ad' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" fill={color}>
      <Circle cx="5.5" cy="12" r="1.35" />
      <Circle cx="12" cy="12" r="1.35" />
      <Circle cx="18.5" cy="12" r="1.35" />
    </Svg>
  );
}

export function ChevronIcon({ size = 13, color = '#6d6d74' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 2)}>
      <Path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function CloseIcon({ size = 12, color = '#a8a8af' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 2.1)}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = C.paper }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 2.2)}>
      <Path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

export function AttachIcon({ size = 18, color = '#d0d0d6' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="m20.2 11.4-7.8 7.8a5.4 5.4 0 0 1-7.6-7.6l8.2-8.2a3.6 3.6 0 0 1 5.1 5.1l-8.2 8.2a1.8 1.8 0 0 1-2.6-2.6l7.6-7.6" />
    </Svg>
  );
}

export function MicIcon({ size = 17, color = '#1b1b19' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.9)}>
      <Rect x="9" y="2.8" width="6" height="11" rx="3" />
      <Path d="M18.6 10.6a6.6 6.6 0 0 1-13.2 0" />
      <Path d="M12 17.2v3.4" />
    </Svg>
  );
}

export function ArrowUpIcon({ size = 18, color = '#1b1b19' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 2)}>
      <Path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function ChatsIcon({ size = 19, color = C.paper }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M20 11.4a7.6 7.6 0 0 1-8.2 7.6 9 9 0 0 1-2.6-.5L4 20l1.6-4.6A7.5 7.5 0 0 1 4 11.4a7.6 7.6 0 0 1 8-7.6 7.6 7.6 0 0 1 8 7.6Z" />
    </Svg>
  );
}

export function BotsIcon({ size = 19, color = '#74747b' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Circle cx="12" cy="12" r="8.4" />
      <Path d="M9.1 10v1.7M14.9 10v1.7" />
    </Svg>
  );
}

/** The settings: three rails, three knobs — a gear reads as a sun at this size. */
export function SettingsIcon({ size = 19, color = '#74747b' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M3.4 7h6.1M13 7h7.6M3.4 12h2.6M9.8 12h10.8M3.4 17h7.2M14.2 17h6.4" />
      <Circle cx="11.2" cy="7" r="2.2" />
      <Circle cx="7.8" cy="12" r="2.2" />
      <Circle cx="12.4" cy="17" r="2.2" />
    </Svg>
  );
}

export function FileIcon({ size = 16, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" />
      <Path d="M13.5 3v5.5H19" />
    </Svg>
  );
}

export function PhotoIcon({ size = 16, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <Circle cx="9" cy="10" r="1.6" />
      <Path d="m4.5 17 4.7-4.7 3.3 3.3 2.6-2.6L20 17" />
    </Svg>
  );
}

export function CameraIcon({ size = 16, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M4 8.5h3l1.4-2h7.2L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
      <Circle cx="12" cy="13.5" r="3.2" />
    </Svg>
  );
}

export function PinIcon({ size = 16, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M9.5 3.5h5l-1 5.2 3.8 3.8H6.7l3.8-3.8Z" />
      <Path d="M12 12.5V21" />
    </Svg>
  );
}

export function TrashIcon({ size = 16, color = '#ff6961' }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l.8 13h9.4l.8-13" />
      <Path d="M10.2 10v6M13.8 10v6" />
    </Svg>
  );
}

export function CopyIcon({ size = 16, color = C.text2 }: IconProps) {
  return (
    <Svg width={box(size)} height={box(size)} viewBox="0 0 24 24" {...stroke(color, 1.7)}>
      <Rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" />
      <Path d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </Svg>
  );
}
