// The end of a turn, and what the person reads there.
//
// Hermes ends every streamed turn with a terminal status: `run.completed` when
// the turn finished, `run.cancelled` when someone stopped it, `run.failed`
// when the agent stopped without finishing — its step budget spent, its
// context compressed away, the stream broken mid-answer. A failed run still
// carries the text the bot wrote before it stopped: a summary of what it did,
// often the whole point of the turn.
//
// This app used to throw that text away and say only "The bot could not finish
// this turn", which is what a person sees after watching their bot work for
// ten minutes. The rules here are what makes that end honest: the answer is
// kept, the reason becomes a sentence, and a turn that produced nothing at all
// is the only one that reads as an error.
//
// It also says how long silence is allowed to last, because a tool that is
// running is not a stream that died.

'use strict';

/** Waiting on the model: it may think, but not for ever. */
const MODEL_SILENCE_MS = 45_000;

/** A tool at work: a build, an install, a scan of a disk. It says nothing. */
const TOOL_SILENCE_MS = 10 * 60 * 1000;

/** The ceiling for one turn, whatever it is doing. */
const TURN_LIMIT_MS = 20 * 60 * 1000;

/**
 * How long the app waits for a word before deciding nothing is coming. A tool
 * that runs gets the long window: the composer is held by a turn that is
 * working, not by one that has gone quiet.
 */
function silenceWindow(options) {
  return options?.toolRunning ? TOOL_SILENCE_MS : MODEL_SILENCE_MS;
}

/** The codes Hermes writes, and what they mean when a person reads them. */
const REASONS = [
  [
    /^max_iterations_reached\((\d+)\/(\d+)\)$/,
    (found) => `it reached its step budget (${found[1]}/${found[2]})`,
  ],
  [/^budget_exhausted$/, () => 'it ran out of the budget for this turn'],
  [
    /^context_compression_(exhausted|timeout)$/,
    () => 'the conversation outgrew what the model can hold',
  ],
  [/^empty_response_exhausted$/, () => 'the model kept answering nothing'],
  [/^all_retries_exhausted_no_response$/, () => 'the model never answered'],
  [/^session_persistence_failed$/, () => 'Hermes could not save the turn'],
  [/^guardrail_halt$/, () => 'the bot stopped itself on a guardrail'],
  [/^partial_stream_recovery$/, () => 'the stream broke mid-answer'],
  [
    /^fallback_prior_turn_content$/,
    () => 'the turn fell back to an earlier answer',
  ],
  [
    /^rebuilt_restart_limit_exceeded$/,
    () => 'the conversation was rebuilt too many times',
  ],
  [
    /^redirect_restart_limit_exceeded$/,
    () => 'the turn was restarted too many times',
  ],
  [/^review_input_budget_exhausted$/, () => 'the turn had more to review than it could hold'],
  [/^pending_tool_result$/, () => 'a tool result never arrived'],
  [
    /^(local_processing_error|repeated_outer_errors|error_near_max_iterations)\(/,
    () => 'Hermes hit an error while running the turn',
  ],
  [/^interpreter_shutdown$/, () => 'Hermes was shutting down'],
  [
    /^interrupted_by_system|^interrupted_during/,
    () => 'the host interrupted the turn',
  ],
];

/**
 * Why a turn stopped, in the words a person reads. A code in the transcript is
 * noise; the sentence is the point of keeping it at all.
 */
function exitReasonWords(reason) {
  const code = String(reason ?? '').trim();
  if (!code) return 'the reason was not given';
  for (const [pattern, words] of REASONS) {
    const found = pattern.exec(code);
    if (found) return words(found);
  }
  return `Hermes stopped it (${code})`;
}

/**
 * What a streamed turn settles to. A finished turn is its answer; a cancelled
 * one is cancelled; a turn that stopped early keeps the text it wrote and
 * carries the reason as a note, and only a turn with nothing to show is an
 * error.
 */
function settleStreamTurn(turn) {
  const text = String(turn?.text ?? '');
  const status = String(turn?.status ?? '') || 'completed';
  if (status === 'completed') return { ok: true, text };
  if (status === 'cancelled') return { ok: false, canceled: true };
  const words = String(turn?.failure ?? '').trim() || exitReasonWords(turn?.reason);
  if (text.trim()) {
    return { ok: true, text, note: `The turn stopped early: ${words}.` };
  }
  return { ok: false, error: `The bot could not finish this turn: ${words}.` };
}

module.exports = {
  MODEL_SILENCE_MS,
  TOOL_SILENCE_MS,
  TURN_LIMIT_MS,
  silenceWindow,
  exitReasonWords,
  settleStreamTurn,
};
