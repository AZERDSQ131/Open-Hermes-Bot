// A turn whose stream goes quiet is not a turn that died. When the host keeps
// a run alive after the app stopped listening, the app watches the run instead
// of calling it lost: the answer is worth waiting for, and it is what the
// person asked for.

/** How often the app asks the host how a watched run is doing. */
const WATCH_POLL_MS = 5_000;

/** How long it is worth watching before calling it lost for good. */
const WATCH_LIMIT_MS = 2 * 60 * 60 * 1000;

const FINISHED = new Set(['completed', 'failed', 'cancelled']);

/** Is the run over, one way or another? */
function runFinished(run) {
  return FINISHED.has(String(run?.status ?? ''));
}

/**
 * What a finished run came to. A completed run keeps its answer, which is the
 * whole point of watching: the person gets the text, not an apology.
 */
function runOutcome(run) {
  const status = String(run?.status ?? '');
  if (status === 'completed') return { ok: true, text: String(run?.output ?? '') };
  if (status === 'cancelled') return { ok: false, canceled: true };
  const reason = String(run?.turn_exit_reason ?? '').trim() || 'the host stopped it';
  return { ok: false, error: `The bot could not finish this turn: ${reason}.` };
}

module.exports = {
  WATCH_POLL_MS,
  WATCH_LIMIT_MS,
  runFinished,
  runOutcome,
};
