// The theatres of state: what a face plays while a turn is running, while it
// waits, when its answer has arrived, and when nobody has looked at it for a
// while. Ported from dsh-bloub-mood (Yuuhann1999), which stages the bloub
// avatar in a session of its own. The engine is already vendored; only the
// score travels here: a mood is a loop of engine states, and a face.

import type { UpdateStatus } from './updates';
import type { StateId } from './vendor/bloub/states';

/**
 * The five moods the plugin stages, and the app stages with it. The names are
 * the plugin's (idle, running, interaction, completed, sleepy): they read as
 * what a conversation is doing, not what a renderer is doing.
 */
export type MoodId = 'idle' | 'running' | 'interaction' | 'completed' | 'sleepy';

/** One entry of the score: an engine state, and how long it is held. */
export type MoodStep = { state: StateId; duration: number };

export type Mood = {
  /** The face the body wears while the theatre runs, painted the bot's colour. */
  expression: string;
  /** The states it walks, in order. */
  steps: readonly MoodStep[];
};

export const MOODS: Record<MoodId, Mood> = {
  idle: {
    expression: 'neutre',
    // The breath, the blink, and the shape that turns into a hexagon: the one
    // transformation quietness is allowed. Nothing here asks for a look.
    steps: [
      { state: 'idle', duration: 2000 },
      { state: 'wink', duration: 1300 },
      { state: 'hexagon', duration: 1600 },
      { state: 'idle', duration: 2400 },
    ],
  },
  running: {
    expression: 'attentif',
    // Thought, the comet's dash, and back to thought: the turn is working.
    steps: [
      { state: 'thinking', duration: 2600 },
      { state: 'comet', duration: 2400 },
      { state: 'thinking', duration: 2600 },
    ],
  },
  interaction: {
    expression: 'curieux',
    // The stare, the alarm, the notification bounce: the bot needs a look.
    steps: [
      { state: 'wide', duration: 1400 },
      { state: 'alert', duration: 2400 },
      { state: 'notify', duration: 2200 },
    ],
  },
  completed: {
    expression: 'fier',
    // The gasp, the tap, the burst of confetti: the answer is there, unread.
    steps: [
      { state: 'exclaim', duration: 2000 },
      { state: 'notify', duration: 2200 },
      { state: 'burst', duration: 2600 },
    ],
  },
  sleepy: {
    expression: 'somnolent',
    // The doze: one state is the whole theatre.
    steps: [{ state: 'sleep', duration: 2400 }],
  },
};

/**
 * How long a quiet face keeps still before it dozes off. Two minutes, as on
 * the plugin: long enough that a reading person is not interrupted, short
 * enough that the sleeping face is actually seen.
 */
export const MOOD_QUIET_MS = 120000;

/** Every mood's step must be an engine state: this type carries no surprises. */
type KnownState = StateId;

const STATES_KNOWN: readonly StateId[] = [
  'idle',
  'thinking',
  'wink',
  'wide',
  'alert',
  'notify',
  'exclaim',
  'sleep',
  'egg',
  'hexagon',
  'play',
  'orbit',
  'burst',
  'comet',
];

/** The face a mood wears. A mood without a face is a face without a body. */
export function moodExpression(mood: MoodId): string {
  return MOODS[mood].expression;
}

/** The score of a mood: the steps it walks. */
export function moodSteps(mood: MoodId): readonly MoodStep[] {
  return MOODS[mood].steps;
}

/** How long the whole score runs, before it starts over. */
export function moodSpan(mood: MoodId): number {
  return MOODS[mood].steps.reduce((sum, step) => sum + step.duration, 0);
}

/** Whether every step of the score names an engine state. */
export function moodIsPlayable(mood: MoodId): boolean {
  return MOODS[mood].steps.every((step) =>
    (STATES_KNOWN as readonly KnownState[]).includes(step.state),
  );
}

/** What a thread says, read as a mood. A waiting bot outranks a working one. */
export function threadMood(thread: {
  pending?: boolean;
  serveFailed?: boolean;
  thinking?: boolean;
  streaming?: string;
  tool?: string;
  unread?: boolean;
}): MoodId {
  if (thread.pending || thread.serveFailed) return 'interaction';
  if (thread.thinking || thread.streaming || thread.tool) return 'running';
  if (thread.unread) return 'completed';
  return 'idle';
}

/** What an update says, read as a mood: the look follows the download. */
export function updateMood(status: UpdateStatus): MoodId {
  switch (status.state) {
    case 'checking':
    case 'downloading':
      return 'running';
    case 'available':
      return 'interaction';
    case 'ready':
      return 'completed';
    default:
      return 'idle';
  }
}
