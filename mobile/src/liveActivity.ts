import { Platform } from 'react-native';
import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import type { HermesTurnProps, QueueFace } from './activity/HermesTurn';

/**
 * The turn, as the Lock Screen sees it.
 *
 * The app is still the window: a turn is started by `send`, moved by the words
 * that arrive, and closed when the answer settles. This file is only the
 * translation — one Live Activity per conversation, updated no faster than the
 * system will listen, and never at the cost of the turn itself.
 *
 * Everything here is a no-op away from iOS, or when the person has turned Live
 * Activities off: a conversation does not depend on a Lock Screen.
 */

type Factory = LiveActivityFactory<HermesTurnProps>;
type Handle = LiveActivity<HermesTurnProps>;

/** How often the activity is allowed to be rewritten while words stream in. */
const THROTTLE_MS = 750;

/** How long the final line stays on the Lock Screen once a turn settles. */
const LINGER_MS = 8000;

let resolved: Factory | null | undefined;

/**
 * The factory, or `null`. The layout module pulls in SwiftUI views, which only
 * exist on iOS, so it is read on the platform that can draw it — not at the
 * top of the app, where the browser and Android also run.
 */
function turnFactory(): Factory | null {
  if (Platform.OS !== 'ios') return null;
  if (resolved !== undefined) return resolved;
  try {
    const module = require('./activity/HermesTurn') as { default: Factory };
    resolved = module.default;
  } catch {
    // A build without the widget target: the app runs, the Lock Screen stays bare.
    resolved = null;
  }
  return resolved;
}

const handles = new Map<string, Handle>();
const shown = new Map<string, HermesTurnProps>();
const sentAt = new Map<string, number>();
const queued = new Map<string, ReturnType<typeof setTimeout>>();

function forget(threadId: string): void {
  const timer = queued.get(threadId);
  if (timer) clearTimeout(timer);
  queued.delete(threadId);
  handles.delete(threadId);
  shown.delete(threadId);
  sentAt.delete(threadId);
}

function flush(threadId: string, force: boolean): void {
  const handle = handles.get(threadId);
  const props = shown.get(threadId);
  if (!handle || !props) return;

  const now = Date.now();
  const wait = THROTTLE_MS - (now - (sentAt.get(threadId) ?? 0));
  if (!force && wait > 0) {
    // Keep the last words of the burst: the timer is armed once, and the
    // props it reads are whatever the newest delta left behind.
    if (!queued.has(threadId)) {
      queued.set(
        threadId,
        setTimeout(() => {
          queued.delete(threadId);
          flush(threadId, true);
        }, wait),
      );
    }
    return;
  }

  sentAt.set(threadId, now);
  try {
    void handle.update(props).catch(() => undefined);
  } catch {
    // The activity was dismissed from the Lock Screen: the turn goes on.
  }
}

function sameQueue(left: QueueFace[], right: QueueFace[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (face, index) =>
        face.color === right[index].color &&
        face.shape === right[index].shape &&
        face.startedAt === right[index].startedAt &&
        (face.faceUris?.length ?? 0) === (right[index].faceUris?.length ?? 0),
    )
  );
}

const spriteRequests = new Set<string>();

function cachedFaces(shape: string | undefined, color: string): string[] {
  if (Platform.OS !== 'ios') return [];
  try {
    const sprites = require('./activity/bloubSprite') as typeof import('./activity/bloubSprite');
    return sprites.cachedFaceSprites(shape, color);
  } catch {
    return [];
  }
}

function requestFaces(shape: string | undefined, color: string, key: string): void {
  if (Platform.OS !== 'ios' || spriteRequests.has(key)) return;
  spriteRequests.add(key);
  void (async () => {
    try {
      const sprites = require('./activity/bloubSprite') as typeof import('./activity/bloubSprite');
      const uris = await sprites.faceSprites(shape, color);
      if (uris.length) syncQueue();
    } catch {
      // The drawn face stays.
    } finally {
      spriteRequests.delete(key);
    }
  })();
}

/**
 * The running agents, in the order their turns started, given to every
 * activity: the Island draws all of them side by side, and the clock is the
 * oldest running turn's.
 */
function syncQueue(): void {
  const roster: QueueFace[] = [];
  for (const props of shown.values()) {
    if (props.phase !== 'thinking' && props.phase !== 'writing') continue;
    const key = `${props.color}|${props.shape ?? ''}`;
    if (roster.some((face) => `${face.color}|${face.shape ?? ''}` === key)) continue;
    const uris = cachedFaces(props.shape, props.color);
    if (!uris.length) requestFaces(props.shape, props.color, key);
    roster.push({
      color: props.color,
      shape: props.shape,
      startedAt: props.startedAt,
      ...(uris.length ? { faceUris: uris } : {}),
    });
  }
  if (!roster.length) return;
  for (const [threadId, props] of shown) {
    if (props.queue && sameQueue(props.queue, roster)) continue;
    shown.set(threadId, { ...props, queue: roster });
    flush(threadId, true);
  }
}

/** A turn has begun: its first line is "thinking", and the clock starts here. */
export function startTurnActivity(threadId: string, props: HermesTurnProps): void {
  const factory = turnFactory();
  if (!factory) return;
  stopTurnActivity(threadId);
  try {
    const handle = factory.start(
      props,
      `hermesbot://chat/${encodeURIComponent(threadId)}`,
    );
    handles.set(threadId, handle);
    shown.set(threadId, props);
    sentAt.set(threadId, Date.now());
    syncQueue();
    // The real Bloub is drawn by the app and written beside the activity. It
    // arrives a moment after the activity starts: until then the activity
    // draws the shape, then switches to the picture the conversation has.
    void (async () => {
      try {
        const { faceSprites } = require('./activity/bloubSprite') as typeof import('./activity/bloubSprite');
        const uris = await faceSprites(props.shape, props.color);
        if (uris.length) {
          updateTurnActivity(threadId, { faceUris: uris });
          syncQueue();
        }
      } catch {
        // No sprite is not a broken turn: the drawn face stays.
      }
    })();
  } catch {
    // Live Activities are off, or this iOS is older than the feature. The
    // turn runs the same without a Lock Screen.
  }
}

/** A delta, a tool call, the answer getting longer: folded into the activity. */
export function updateTurnActivity(
  threadId: string,
  patch: Partial<HermesTurnProps>,
): void {
  const current = shown.get(threadId);
  if (!current) return;
  shown.set(threadId, { ...current, ...patch });
  flush(threadId, false);
}

/** The turn is over: its last line stays a few seconds, then the screen clears. */
export function finishTurnActivity(
  threadId: string,
  patch: Partial<HermesTurnProps>,
): void {
  const handle = handles.get(threadId);
  const current = shown.get(threadId);
  forget(threadId);
  syncQueue();
  if (!handle || !current) return;
  const final: HermesTurnProps = { ...current, ...patch };
  if (final.faceUris?.length) final.faceUris = final.faceUris.slice(0, 1);
  try {
    void handle
      .end({ after: new Date(Date.now() + LINGER_MS) }, final)
      .catch(() => undefined);
  } catch {
    // Nothing left to end.
  }
}

/** The conversation went away under the turn, or the person disconnected. */
export function stopTurnActivity(threadId: string): void {
  const handle = handles.get(threadId);
  forget(threadId);
  syncQueue();
  if (!handle) return;
  try {
    void handle.end('immediate').catch(() => undefined);
  } catch {
    // Already gone.
  }
}

/** Nothing is being followed any more: the phone let the host go. */
export function stopAllTurnActivities(): void {
  for (const threadId of [...handles.keys()]) stopTurnActivity(threadId);
}

/**
 * A turn cannot outlive the app process that ran it: on launch, anything the
 * Lock Screen still shows from a killed session is taken down.
 */
export function sweepTurnActivities(): void {
  const factory = turnFactory();
  if (!factory) return;
  try {
    for (const instance of factory.getInstances()) {
      void instance.end('immediate').catch(() => undefined);
    }
  } catch {
    // No ActivityKit, nothing to sweep.
  }
}
