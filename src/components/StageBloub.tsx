import { useEffect, useId, useRef, useState } from 'react';
import { BotEngine, type BotFrame } from '../vendor/bloub/engine';
import { EXPRESSION_BY_ID } from '../vendor/bloub/expressions';
import { RAYON } from '../vendor/bloub/repere';
import { SHAPE_BY_ID } from '../vendor/bloub/skins';
import type { StateId } from '../vendor/bloub/states';
import { EYE_PAPER } from './Bloub';

/**
 * The one that acts.
 *
 * The app's mascots are faces: a shape, a colour, two eyes. This one is a
 * character — it breathes, it blinks, it looks around, and it changes its
 * mind when the scene asks it to. The engine does the acting; the scene
 * decides what it is doing.
 */

type StageBloubProps = {
  /** The colour it wears. */
  color: string;
  /** The shape of its body: it glides into the new one. */
  shape: string;
  /** What it is doing: thinking, winking, looking up. */
  state: StateId;
  /** How it feels about it. */
  expression: string;
  size?: number;
};

export function StageBloub({
  color,
  shape,
  state,
  expression,
  size = 160,
}: StageBloubProps) {
  const rawId = useId();
  const maskId = `stage-bloub-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [frame, setFrame] = useState<BotFrame | null>(null);
  const engineRef = useRef<BotEngine | null>(null);
  const startedAt = useRef(0);

  // The engine runs on its own clock: the same one every setter is given, so
  // the glides land on the same timeline as the drawing.
  useEffect(() => {
    const engine = new BotEngine(RAYON, 'idle', null, null);
    engineRef.current = engine;
    startedAt.current = performance.now();

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setFrame(engine.sample(0));
      return;
    }

    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      // The engine runs on its own clock: the same one every setter is given.
      // The timestamp of the frame is not it — it does not always share the
      // origin of `performance.now()`, and an engine fed a time from the
      // future never leaves the state it came from.
      const elapsed = (performance.now() - startedAt.current) / 1000;
      setFrame(engine.sample(elapsed));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setState(state, (performance.now() - startedAt.current) / 1000);
  }, [state]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setShape(
      SHAPE_BY_ID.get(shape)?.radii ?? null,
      (performance.now() - startedAt.current) / 1000,
    );
  }, [shape]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setExpression(
      EXPRESSION_BY_ID.get(expression) ?? null,
      (performance.now() - startedAt.current) / 1000,
    );
  }, [expression]);

  const dots = frame?.dots ?? [];
  const behind = frame?.dotsBehind ? dots : [];
  const front = frame?.dotsBehind ? [] : dots;

  function drawDots(list: typeof dots) {
    return list.map((dot, index) =>
      dot.d ? (
        <path
          key={index}
          d={dot.d}
          transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0})`}
          fill={dot.color ?? color}
          opacity={dot.opacity}
        />
      ) : (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={dot.color ?? color}
          opacity={dot.opacity}
        />
      ),
    );
  }

  return (
    <span className="stage-bloub" style={{ width: size, height: size }}>
      {frame ? (
        <svg
          className="bloub-svg"
          viewBox="-158 -158 316 316"
          aria-hidden="true"
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
          {drawDots(behind)}
          <path d={frame.bodyPath} fill={EYE_PAPER} />
          <g mask={`url(#${maskId})`} opacity={frame.bodyAlpha}>
            <rect x="-158" y="-158" width="316" height="316" fill={color} />
          </g>
          {drawDots(front)}
        </svg>
      ) : null}
    </span>
  );
}
