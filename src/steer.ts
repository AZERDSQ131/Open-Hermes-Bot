/**
 * A message typed while a turn is still running.
 *
 * The window used to answer that by killing the turn and starting another one,
 * which throws away the work the person was waiting for. Hermes can carry the
 * text into the run instead (POST /v1/runs/<id>/steer), at the run's next tool
 * boundary, so the answer keeps coming and the note is not lost.
 *
 * Attachments cannot ride a steer: the host takes text, and a file the run
 * never asked for has no place in a tool result. Those start the next turn.
 */
export function joinsRunningTurn(turn: {
  busy: boolean;
  text: string;
  attachments: number;
}): boolean {
  if (!turn.busy) return false;
  if (!turn.text.trim()) return false;
  return turn.attachments === 0;
}

/** What the transcript says about a line that joined a turn already running. */
export const STEERED_NOTE = 'Added to the turn in progress';
