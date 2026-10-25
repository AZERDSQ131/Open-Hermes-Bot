import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The rules live in a CommonJS module, because the bridge that uses them runs
// in the Electron main process. The test loads it the way Node does.
const require = createRequire(import.meta.url);
const {
  MODEL_SILENCE_MS,
  TOOL_SILENCE_MS,
  TURN_LIMIT_MS,
  exitReasonWords,
  settleStreamTurn,
  silenceWindow,
} = require('./stream.js');

describe('how long silence lasts', () => {
  it('gives a model less time than a tool', () => {
    expect(MODEL_SILENCE_MS).toBe(45_000);
    expect(TOOL_SILENCE_MS).toBe(600_000);
    expect(silenceWindow({ toolRunning: true })).toBe(TOOL_SILENCE_MS);
    expect(silenceWindow({ toolRunning: false })).toBe(MODEL_SILENCE_MS);
    expect(silenceWindow()).toBe(MODEL_SILENCE_MS);
  });

  it('lets one turn run for twenty minutes', () => {
    expect(TURN_LIMIT_MS).toBe(1_200_000);
  });
});

describe('why a turn stopped', () => {
  it('says a spent step budget, with the numbers Hermes counted', () => {
    expect(exitReasonWords('max_iterations_reached(60/60)')).toBe(
      'it reached its step budget (60/60)',
    );
  });

  it('says the codes that have one plain meaning', () => {
    expect(exitReasonWords('budget_exhausted')).toBe(
      'it ran out of the budget for this turn',
    );
    expect(exitReasonWords('context_compression_exhausted')).toBe(
      'the conversation outgrew what the model can hold',
    );
    expect(exitReasonWords('context_compression_timeout')).toBe(
      'the conversation outgrew what the model can hold',
    );
    expect(exitReasonWords('empty_response_exhausted')).toBe(
      'the model kept answering nothing',
    );
    expect(exitReasonWords('all_retries_exhausted_no_response')).toBe(
      'the model never answered',
    );
    expect(exitReasonWords('session_persistence_failed')).toBe(
      'Hermes could not save the turn',
    );
    expect(exitReasonWords('guardrail_halt')).toBe(
      'the bot stopped itself on a guardrail',
    );
    expect(exitReasonWords('partial_stream_recovery')).toBe(
      'the stream broke mid-answer',
    );
    expect(exitReasonWords('fallback_prior_turn_content')).toBe(
      'the turn fell back to an earlier answer',
    );
    expect(exitReasonWords('rebuilt_restart_limit_exceeded')).toBe(
      'the conversation was rebuilt too many times',
    );
    expect(exitReasonWords('redirect_restart_limit_exceeded')).toBe(
      'the turn was restarted too many times',
    );
    expect(exitReasonWords('review_input_budget_exhausted')).toBe(
      'the turn had more to review than it could hold',
    );
    expect(exitReasonWords('pending_tool_result')).toBe(
      'a tool result never arrived',
    );
    expect(exitReasonWords('interpreter_shutdown')).toBe(
      'Hermes was shutting down',
    );
  });

  it('wraps the codes that carry a message of their own', () => {
    expect(exitReasonWords('local_processing_error(boom)')).toBe(
      'Hermes hit an error while running the turn',
    );
    expect(exitReasonWords('repeated_outer_errors(boom)')).toBe(
      'Hermes hit an error while running the turn',
    );
    expect(exitReasonWords('error_near_max_iterations(boom)')).toBe(
      'Hermes hit an error while running the turn',
    );
    expect(exitReasonWords('interrupted_by_system(watchdog)')).toBe(
      'the host interrupted the turn',
    );
  });

  it('keeps a code nobody knows rather than inventing a reason', () => {
    expect(exitReasonWords('something_new(42)')).toBe(
      'Hermes stopped it (something_new(42))',
    );
    expect(exitReasonWords('')).toBe('the reason was not given');
    expect(exitReasonWords(undefined)).toBe('the reason was not given');
  });
});

describe('the end of a turn', () => {
  it('is the answer when the turn finished', () => {
    expect(settleStreamTurn({ text: 'All done.', status: 'completed' })).toEqual(
      { ok: true, text: 'All done.' },
    );
  });

  it('is an answer with a note when the turn stopped early', () => {
    expect(
      settleStreamTurn({
        text: 'I upgraded the packages and restarted the service.',
        status: 'failed',
        reason: 'max_iterations_reached(60/60)',
      }),
    ).toEqual({
      ok: true,
      text: 'I upgraded the packages and restarted the service.',
      note: 'The turn stopped early: it reached its step budget (60/60).',
    });
  });

  it('prefers the message Hermes itself gave', () => {
    expect(
      settleStreamTurn({
        text: 'Half an answer',
        status: 'failed',
        reason: 'guardrail_halt',
        failure: 'the model was refused',
      }),
    ).toEqual({
      ok: true,
      text: 'Half an answer',
      note: 'The turn stopped early: the model was refused.',
    });
  });

  it('is an error only when nothing was written', () => {
    expect(
      settleStreamTurn({ text: '   ', status: 'failed', reason: 'budget_exhausted' }),
    ).toEqual({
      ok: false,
      error:
        'The bot could not finish this turn: it ran out of the budget for this turn.',
    });
  });

  it('is cancelled when the person stopped it', () => {
    expect(settleStreamTurn({ text: 'part', status: 'cancelled' })).toEqual({
      ok: false,
      canceled: true,
    });
  });

  it('reads a stream with no terminal status as finished, as before', () => {
    expect(settleStreamTurn({ text: 'ok' })).toEqual({ ok: true, text: 'ok' });
    expect(settleStreamTurn({})).toEqual({ ok: true, text: '' });
  });
});
