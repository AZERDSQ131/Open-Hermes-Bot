// How hard the model thinks before it answers. The host takes this per turn
// (`model_options.reasoning`), so the app can offer the choice on the model
// itself, in the conversation, instead of a setting that would change every
// conversation at once.
//
// Three choices, because three are what a person can tell apart at a glance.
// The host knows a longer ladder (minimal, low, medium, high, xhigh, max,
// ultra): Deep asks for the top of what is reasonable, and a model that does
// not know that step gets the nearest one it does, because the host clamps.

export type Effort = 'off' | 'deep';

export type EffortChoice = { id: Effort | 'auto'; label: string };

/** The choices the model menu offers, the default first. */
export const EFFORT_CHOICES: EffortChoice[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'off', label: 'Off' },
  { id: 'deep', label: 'Deep' },
];

/** What each choice means, said without a manual. */
export const EFFORT_HINTS: Record<string, string> = {
  auto: 'The model decides how much to think',
  off: 'Answer straight away, without thinking first',
  deep: 'Think it through, even if it takes longer',
};

/** Where the chosen pill sits, so the highlight can slide to it. */
export function effortIndex(effort?: string): number {
  const index = EFFORT_CHOICES.findIndex((choice) => choice.id === (effort || 'auto'));
  return index === -1 ? 0 : index;
}

/**
 * The reasoning options for one turn, or nothing when the person left it to
 * the model. Off is the only way to ask for no thinking at all; the effort is
 * the host's own word, kept here so the window can say it in a plain one.
 */
export function reasoningFor(
  effort?: string,
): { enabled?: boolean; effort?: string } | undefined {
  if (effort === 'off') return { enabled: false };
  if (effort === 'deep') return { effort: 'high' };
  return undefined;
}
