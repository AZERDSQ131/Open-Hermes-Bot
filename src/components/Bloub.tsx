import { useId } from 'react';
import {
  BLOUB_FRAMES,
  type BloubShape,
  type BloubVariant,
} from './bloubFrames';

export const EYE_PAPER = '#f6f3e9';

export const BLOUB_SHAPE_OPTIONS: { id: BloubShape; label: string }[] = [
  { id: 'cercle', label: 'Circle' },
  { id: 'galet', label: 'Pebble' },
  { id: 'squircle', label: 'Squircle' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hexagone', label: 'Hexagon' },
  { id: 'nuage', label: 'Cloud' },
  { id: 'goutte', label: 'Drop' },
];

export const BLOUB_COLOR_OPTIONS: { name: string; hex: string }[] = [
  { name: 'Teal', hex: '#4f9d8f' },
  { name: 'Turquoise', hex: '#2fbfa0' },
  { name: 'Blue', hex: '#3f6fd1' },
  { name: 'Indigo', hex: '#5b5bda' },
  { name: 'Violet', hex: '#7a5bc2' },
  { name: 'Pink', hex: '#e152b0' },
  { name: 'Red', hex: '#e8483f' },
  { name: 'Orange', hex: '#e09248' },
  { name: 'Amber', hex: '#e0b34e' },
  { name: 'Green', hex: '#3ecf8e' },
  { name: 'Gray', hex: '#9a9aa2' },
  { name: 'Ink', hex: '#2b2b31' },
];

type BloubSvgProps = {
  color: string;
  shape?: BloubShape;
  variant?: BloubVariant;
};

export function BloubSvg({
  color,
  shape = 'cercle',
  variant = 'neutral',
}: BloubSvgProps) {
  const rawId = useId();
  const maskId = `bloub-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const shapeFrames = BLOUB_FRAMES[shape];
  const frame = shapeFrames.variants[variant];
  const viewBox = shapeFrames.viewBox;

  return (
    <svg
      className="bloub-svg"
      viewBox={`${-viewBox} ${-viewBox} ${viewBox * 2} ${viewBox * 2}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-viewBox}
          y={-viewBox}
          width={viewBox * 2}
          height={viewBox * 2}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, index) => (
            <path
              key={index}
              d={eye.d}
              transform={eye.matrix}
              opacity={eye.alpha}
              fill="#000"
            />
          ))}
        </mask>
      </defs>
      <path d={frame.bodyPath} fill={EYE_PAPER} />
      <g mask={`url(#${maskId})`}>
        <rect
          x={-viewBox}
          y={-viewBox}
          width={viewBox * 2}
          height={viewBox * 2}
          fill={color}
        />
      </g>
    </svg>
  );
}
