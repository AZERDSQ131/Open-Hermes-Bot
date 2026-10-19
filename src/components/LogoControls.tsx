import type { BloubShape } from './bloubFrames';
import {
  BLOUB_COLOR_OPTIONS,
  BLOUB_SHAPE_OPTIONS,
  BloubSvg,
} from './Bloub';

type ShapeGridProps = {
  value: BloubShape;
  color: string;
  onChange: (shape: BloubShape) => void;
};

export function ShapeGrid({ value, color, onChange }: ShapeGridProps) {
  return (
    <div className="shape-grid">
      {BLOUB_SHAPE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`shape-option ${value === option.id ? 'is-active' : ''}`}
          aria-label={option.label}
          aria-pressed={value === option.id}
          title={option.label}
          onClick={() => onChange(option.id)}
        >
          <span className="shape-option-art">
            <BloubSvg color={color} shape={option.id} />
          </span>
          <span className="shape-option-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

type ColorGridProps = {
  value: string;
  onChange: (color: string) => void;
};

export function ColorGrid({ value, onChange }: ColorGridProps) {
  return (
    <div className="color-grid">
      {BLOUB_COLOR_OPTIONS.map((color) => (
        <button
          key={color.hex}
          type="button"
          className={`color-option ${value === color.hex ? 'is-active' : ''}`}
          style={{ background: color.hex }}
          aria-label={color.name}
          aria-pressed={value === color.hex}
          title={color.name}
          onClick={() => onChange(color.hex)}
        />
      ))}
    </div>
  );
}
