import { useEffect, useId, useState } from 'react';
import { BotEngine, type BotFrame } from '../vendor/bloub/engine';
import { EXPRESSION_BY_ID } from '../vendor/bloub/expressions';
import { RAYON } from '../vendor/bloub/repere';
import { SHAPE_BY_ID } from '../vendor/bloub/skins';
import type { StateId } from '../vendor/bloub/states';
import { BLOUB_FRAMES, type BloubShape } from './bloubFrames';
import { EYE_PAPER } from './Bloub';

type AnimatedBloubProps = {
  color: string;
  shape: BloubShape;
  size?: number;
};

const TIMELINE: { state: StateId; duration: number }[] = [
  { state: 'idle', duration: 2800 },
  { state: 'wink', duration: 1300 },
  { state: 'wide', duration: 1500 },
  { state: 'idle', duration: 3000 },
];

export function AnimatedBloub({
  color,
  shape,
  size = 64,
}: AnimatedBloubProps) {
  const rawId = useId();
  const maskId = `bloub-anim-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [frame, setFrame] = useState<BotFrame | null>(null);
  const viewBox = BLOUB_FRAMES[shape].viewBox;

  useEffect(() => {
    const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? null;
    const expression = EXPRESSION_BY_ID.get('neutre') ?? null;
    const engine = new BotEngine(RAYON, 'idle', shapeRadii, expression);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setFrame(engine.sample(1.2));
      return;
    }

    let raf = 0;
    let step = 0;
    let stepStart = 0;
    let stopped = false;
    const startedAt = performance.now();

    setFrame(engine.sample(0.4));

    const tick = (now: number) => {
      if (stopped) return;
      const elapsed = (now - startedAt) / 1000;

      while (elapsed - stepStart >= TIMELINE[step].duration) {
        stepStart += TIMELINE[step].duration;
        step = (step + 1) % TIMELINE.length;
        engine.setState(TIMELINE[step].state, stepStart);
      }

      setFrame(engine.sample(elapsed));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [shape]);

  return (
    <span
      className="bloub-animated"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {frame ? (
        <svg
          className="bloub-svg"
          viewBox={`${-viewBox} ${-viewBox} ${viewBox * 2} ${viewBox * 2}`}
          focusable="false"
        >
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="-158"
              y="-158"
              width="316"
              height="316"
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
          <g mask={`url(#${maskId})`} opacity={frame.bodyAlpha}>
            <rect
              x="-158"
              y="-158"
              width="316"
              height="316"
              fill={color}
            />
          </g>
        </svg>
      ) : null}
    </span>
  );
}
