import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { WATCH_POLL_MS, WATCH_MISS_LIMIT, WATCH_LIMIT_MS, runFinished, runOutcome } = require('./watch.js');

describe('watching a run the app stopped listening to', () => {
  it('waits long enough to be worth it, and no longer', () => {
    expect(WATCH_POLL_MS).toBe(5_000);
    expect(WATCH_MISS_LIMIT).toBe(5);
    expect(WATCH_LIMIT_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('knows when the run is over', () => {
    expect(runFinished({ status: 'queued' })).toBe(false);
    expect(runFinished({ status: 'running' })).toBe(false);
    expect(runFinished({})).toBe(false);
    expect(runFinished({ status: 'completed' })).toBe(true);
    expect(runFinished({ status: 'failed' })).toBe(true);
    expect(runFinished({ status: 'cancelled' })).toBe(true);
  });

  it('gives back the answer of a run that finished', () => {
    expect(runOutcome({ status: 'completed', output: 'quarante-deux.' })).toEqual({
      ok: true,
      text: 'quarante-deux.',
    });
    expect(runOutcome({ status: 'completed' })).toEqual({ ok: true, text: '' });
  });

  it('keeps a cancelled run cancelled', () => {
    expect(runOutcome({ status: 'cancelled' })).toEqual({ ok: false, canceled: true });
  });

  it('says why a failed run failed, and says something when the host does not', () => {
    expect(runOutcome({ status: 'failed', turn_exit_reason: 'budget_exhausted' })).toEqual({
      ok: false,
      error: 'The bot could not finish this turn: budget_exhausted.',
    });
    expect(runOutcome({ status: 'failed' })).toEqual({
      ok: false,
      error: 'The bot could not finish this turn: the host stopped it.',
    });
    expect(runOutcome(undefined)).toEqual({
      ok: false,
      error: 'The bot could not finish this turn: the host stopped it.',
    });
  });
});
