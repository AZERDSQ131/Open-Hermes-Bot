import { useEffect, useId, useState } from 'react';
import { BotEngine, type BotFrame } from '../vendor/bloub/engine';
import {
  EXPRESSION_BY_ID,
  EXPRESSIONS,
} from '../vendor/bloub/expressions';
import { RAYON } from '../vendor/bloub/repere';
import { SHAPE_BY_ID } from '../vendor/bloub/skins';
import {
  MOOD_QUIET_MS,
  moodExpression,
  moodSteps,
  type MoodId,
} from '../moods';
import { BLOUB_FRAMES, type BloubShape } from './bloubFrames';
import { EYE_PAPER } from './Bloub';

/**
 * The one that walks a theatre.
 *
 * Where `StageBloub` is a character told what to do scene by scene, this one
 * is given a mood — a score of engine states, in the language of
 * dsh-bloub-mood — and walks it around the clock until the mood changes. A
 * quiet mood dozes off on its own; an interactive one swaps its face on a
 * click, the way the plugin does, and the next mood takes the face back.
 */

type MoodBloubProps = {
  /** The colour it wears: the bot's own. */
  color: string;
  /** The shape of its body: it glides between the score's poses. */
  shape: BloubShape;
  /** The mood it plays. */
  mood: MoodId;
  size?: number;
  /**
   * A click is allowed to change the face — and only then. A row of the
   * sidebar is navigation: its click goes to the row, not to the face.
   */
  interactive?: boolean;
  /** How long a quiet mood sleeps. Default: the two minutes of the plugin. */
  quietMs?: number;
};

export function MoodBloub({
  color,
  shape,
  mood,
  size = 40,
  interactive = false,
  quietMs = MOOD_QUIET_MS,
}: MoodBloubProps) {
  const rawId = useId();
  const maskId = `bloub-mood-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const viewBox = BLOUB_FRAMES[shape].viewBox;
  const [frame, setFrame] = useState<BotFrame | null>(null);
  // The face the click gave, till the next mood takes it back.
  const [override, setOverride] = useState<string | null>(null);
  const [dozing, setDozing] = useState(false);

  // A mood change is a scene change: the borrowed face returns with it.
  useEffect(() => {
    setOverride(null);
  }, [mood]);

  // The quiet face falls asleep on its own, after the two minutes of the
  // plugin — unless the look a click asked for keeps it awake.
  useEffect(() => {
    if (mood !== 'idle' || override !== null) {
      setDozing(false);
      return;
    }
    const timer = window.setTimeout(() => setDozing(true), quietMs);
    return () => window.clearTimeout(timer);
  }, [mood, override, quietMs]);

  // What is played: the mood, or the doze that follows a quiet one.
  const played: MoodId = dozing && mood === 'idle' ? 'sleepy' : mood;

  useEffect(() => {
    const steps = moodSteps(played);
    const expressionId = override ?? moodExpression(played);
    const engine = new BotEngine(
      RAYON,
      steps[0].state,
      SHAPE_BY_ID.get(shape)?.radii ?? null,
      EXPRESSION_BY_ID.get(expressionId) ?? null,
    );
    let stopped = false;
    let step = 0;
    let stepStart = 0;
    const startedAt = performance.now();

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setFrame(engine.sample(0.5));
      return;
    }

    // The first frame is drawn at once: no empty face while the clock starts.
    setFrame(engine.sample(0.4));

    const tick = (now: number) => {
      if (stopped) return;
      const elapsed = (now - startedAt) / 1000;

      while (elapsed - stepStart >= steps[step].duration) {
        stepStart += steps[step].duration;
        step = (step + 1) % steps.length;
        engine.setState(steps[step].state, stepStart);
      }

      setFrame(engine.sample(elapsed));
      requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [played, override, shape]);

  function swapFace() {
    if (!interactive) return;
    const worn = override ?? moodExpression(played);
    const others = EXPRESSIONS.filter((item) => item.id !== worn);
    const next = others[Math.floor(Math.random() * others.length)];
    setOverride(next ? next.id : null);
  }

  const worn = override ?? moodExpression(played);

  return (
    <span
      className="bloub-animated mood-bloub"
      style={{ width: size, height: size }}
      data-mood={played}
      data-face={worn}
      aria-hidden={interactive ? undefined : true}
      aria-label={interactive ? 'Change its face' : undefined}
      onClick={interactive ? swapFace : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') swapFace();
            }
          : undefined
      }
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
