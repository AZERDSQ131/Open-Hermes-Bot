import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import { widgetsDirectory } from 'expo-widgets';
import {
  BLOUB_FRAMES,
  BLOUB_SHAPES,
  type BloubShape,
  type BloubVariant,
} from '../bloubFrames';

/**
 * The bot's face, as the widget can draw it.
 *
 * The Bloub is an SVG of paths; the widget's runtime only knows SwiftUI views,
 * so the app renders the real paths once, at 160 points, and writes the PNG in
 * the app group both processes share. The Live Activity then draws the picture
 * the conversation draws, not an approximation of it.
 *
 * The frames are the five variants the app already has: cycling them on the
 * activity's beat is the face moving on the Lock Screen.
 */

/** The order the widget cycles: idle, listening, wondering, wide, wink. */
export const FACE_VARIANTS: BloubVariant[] = [
  'neutral',
  'attentive',
  'curious',
  'wide',
  'wink',
];

const SIZE = 160;
const PAPER = '#f6f3e9';

type Job = {
  key: string;
  shape: BloubShape;
  color: string;
  variant: BloubVariant;
  resolve: (uri: string | null) => void;
};

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const queue: Job[] = [];
let kick: (() => void) | null = null;

function shapeOf(raw?: string): BloubShape {
  const wanted = String(raw ?? '').trim() as BloubShape;
  return BLOUB_SHAPES.includes(wanted) ? wanted : 'cercle';
}

function keyOf(shape: BloubShape, color: string, variant: BloubVariant): string {
  return `${shape}-${color.replace(/[^a-zA-Z0-9]/g, '')}-${variant}`;
}

function request(shape: BloubShape, color: string, variant: BloubVariant): Promise<string | null> {
  const key = keyOf(shape, color, variant);
  const ready = cache.get(key);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job: Job = {
    key,
    shape,
    color,
    variant,
    resolve: () => undefined,
  };
  const promise = new Promise<string | null>((resolve) => {
    job.resolve = resolve;
  });
  pending.set(key, promise);
  queue.push(job);
  kick?.();
  return promise;
}

/** Every variant of one bot, in the order the activity cycles them. */
export async function faceSprites(shape: string | undefined, color: string): Promise<string[]> {
  if (!widgetsDirectory) return [];
  const resolved = shapeOf(shape);
  const uris = await Promise.all(
    FACE_VARIANTS.map((variant) => request(resolved, color || '#8b5cf6', variant)),
  );
  return uris.filter((uri): uri is string => Boolean(uri));
}

/** The variants already drawn and written, if this bot has been seen. */
export function cachedFaceSprites(shape: string | undefined, color: string): string[] {
  const resolved = shapeOf(shape);
  const tint = color || '#8b5cf6';
  return FACE_VARIANTS.map((variant) => cache.get(keyOf(resolved, tint, variant))).filter(
    (uri): uri is string => Boolean(uri),
  );
}

/**
 * Draws one sprite at a time, out of sight, and writes it where the widget can
 * read it. Mounted once at the root: no screen has to know it exists.
 */
export function BloubSpriteHost() {
  const [job, setJob] = useState<Job | null>(null);
  const svg = useRef<Svg | null>(null);

  useEffect(() => {
    kick = () => setJob((current) => current ?? queue.shift() ?? null);
    kick();
    return () => {
      kick = null;
    };
  }, []);

  useEffect(() => {
    if (!job) {
      kick?.();
      return;
    }
    // One turn of the loop, so the native SVG view is mounted and has a size
    // before it is asked to draw itself.
    const timer = setTimeout(() => {
      svg.current?.toDataURL(
        (data) => {
          void (async () => {
            let uri: string | null = null;
            try {
              const base64 = data.slice(data.indexOf(',') + 1);
              const dir = widgetsDirectory.endsWith('/')
                ? widgetsDirectory
                : `${widgetsDirectory}/`;
              const path = `${dir}hermes-face-${job.key}.png`;
              await FileSystem.writeAsStringAsync(path, base64, {
                encoding: FileSystem.EncodingType.Base64,
              });
              uri = path;
              cache.set(job.key, path);
            } catch {
              // A sprite that cannot be written only means the shape fallback.
            }
            job.resolve(uri);
            pending.delete(job.key);
            setJob(null);
          })();
        },
        { width: SIZE, height: SIZE },
      );
    }, 40);
    return () => clearTimeout(timer);
  }, [job]);

  if (!job || !widgetsDirectory) return null;

  const data = BLOUB_FRAMES[job.shape] ?? BLOUB_FRAMES.cercle;
  const frame = data.variants[job.variant] ?? data.variants.neutral;
  const view = data.viewBox;
  const maskId = `hermes-sprite-${job.key}`;

  return (
    <View
      collapsable={false}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -400,
        top: -400,
        width: SIZE,
        height: SIZE,
        opacity: 1,
      }}
    >
      <Svg
        ref={svg}
        width={SIZE}
        height={SIZE}
        viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`}
      >
        <Defs>
          <Mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-view}
            y={-view}
            width={view * 2}
            height={view * 2}
          >
            <Path d={frame.bodyPath} fill="#fff" />
            {frame.eyes.map((eye, index) => (
              <Path
                key={index}
                d={eye.d}
                transform={eye.matrix}
                opacity={eye.alpha}
                fill="#000"
              />
            ))}
          </Mask>
        </Defs>
        <Path d={frame.bodyPath} fill={PAPER} />
        <G mask={`url(#${maskId})`}>
          <Rect x={-view} y={-view} width={view * 2} height={view * 2} fill={job.color} />
        </G>
      </Svg>
    </View>
  );
}
