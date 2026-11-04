import { Platform } from 'react-native';
import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import type { HermesTurnProps } from './activity/HermesTurn';

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

/**
 * How often the face is given a new beat while a turn runs. A Live Activity
 * does not animate by itself: each content update animates the change from the
 * beat before it, so this is also the pulse of the bot.
 */
const BEAT_MS = 700;

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
const beats = new Map<string, ReturnType<typeof setInterval>>();
const ticks = new Map<string, number>();

function forget(threadId: string): void {
  const timer = queued.get(threadId);
  if (timer) clearTimeout(timer);
  queued.delete(threadId);
  const beat = beats.get(threadId);
  if (beat) clearInterval(beat);
  beats.delete(threadId);
  ticks.delete(threadId);
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
    shown.set(threadId, { ...props, beat: 0 });
    sentAt.set(threadId, Date.now());
    ticks.set(threadId, 0);
    // The face is given a new beat while the turn runs: that is the animation
    // the Island can show without asking the system for a running clock.
    beats.set(
      threadId,
      setInterval(() => {
        const next = (ticks.get(threadId) ?? 0) + 1;
        const current = shown.get(threadId);
        if (!current) return;
        ticks.set(threadId, next);
        shown.set(threadId, { ...current, beat: next });
        flush(threadId, true);
      }, BEAT_MS),
    );
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
  if (!handle || !current) return;
  try {
    void handle
      .end({ after: new Date(Date.now() + LINGER_MS) }, { ...current, ...patch })
      .catch(() => undefined);
  } catch {
    // Nothing left to end.
  }
}

/** The conversation went away under the turn, or the person disconnected. */
export function stopTurnActivity(threadId: string): void {
  const handle = handles.get(threadId);
  forget(threadId);
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
