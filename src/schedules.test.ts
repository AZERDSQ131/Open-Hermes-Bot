import { describe, expect, it } from 'vitest';
import {
  deliverText,
  distance,
  draftBody,
  draftProblem,
  emptyText,
  lastRunText,
  moment,
  nextRunText,
  readSchedules,
  runJobOf,
  runsByJob,
  scheduleExpression,
  scheduleName,
  scheduleState,
  scheduleText,
  schedulerStanding,
  sortSchedules,
  type Schedule,
} from './schedules';

const NOW = Date.parse('2026-10-28T12:00:00+01:00');

/** One row, as the page would hold it, for the tests about its words. */
function row(over: Partial<Schedule> = {}): Schedule {
  return {
    id: 'job-1',
    name: 'The morning read',
    when: 'every 6h',
    expression: '0 */6 * * *',
    state: 'scheduled',
    nextRun: NOW + 3_600_000,
    lastRun: NOW - 3_600_000,
    lastStatus: 'ok',
    lastError: '',
    lastDeliveryError: '',
    deliver: 'local',
    noAgent: false,
    completed: 4,
    ...over,
  };
}

describe('when a schedule runs', () => {
  it('takes the host at its word when it wrote the line', () => {
    expect(scheduleText({ schedule_display: 'every monday 9am' })).toBe(
      'every monday 9am',
    );
  });

  it('falls back to the display of the shape', () => {
    expect(scheduleText({ schedule: { display: 'every 2h' } })).toBe('every 2h');
  });

  it('falls back to the expression of a cron', () => {
    expect(scheduleText({ schedule: { expression: '0 9 * * *' } })).toBe(
      '0 9 * * *',
    );
  });

  it('keeps the expression the host will parse, for the person who wants it', () => {
    expect(scheduleExpression({ schedule: { expression: '0 9 * * *' } })).toBe(
      '0 9 * * *',
    );
    expect(scheduleExpression({ schedule: { minutes: 60 } })).toBe('');
    expect(scheduleExpression({})).toBe('');
    expect(scheduleExpression({ schedule: null as never })).toBe('');
  });

  it('writes an interval of whole days, hours or minutes', () => {
    expect(scheduleText({ schedule: { minutes: 2880 } })).toBe('every 2d');
    expect(scheduleText({ schedule: { minutes: 180 } })).toBe('every 3h');
    expect(scheduleText({ schedule: { minutes: 45 } })).toBe('every 45m');
  });

  it('says nothing when the host gave no shape it knows', () => {
    expect(scheduleText({})).toBe('');
    expect(scheduleText({ schedule: {} })).toBe('');
    expect(scheduleText({ schedule: null as never })).toBe('');
    expect(scheduleText({ schedule: { minutes: 0 } })).toBe('');
  });
});

describe('what a schedule is called', () => {
  it('uses the name the person gave it', () => {
    expect(scheduleName({ name: 'Nightly notes' })).toBe('Nightly notes');
  });

  it('uses the first line of what it asks for, when it has no name', () => {
    expect(scheduleName({ prompt: 'Read the inbox\nand answer' })).toBe(
      'Read the inbox',
    );
  });

  it('cuts a long prompt rather than grow a row', () => {
    const long = 'A'.repeat(80);
    expect(scheduleName({ prompt: long })).toBe(`${'A'.repeat(61)}...`);
  });

  it('names a row the host left blank', () => {
    expect(scheduleName({})).toBe('Untitled schedule');
    expect(scheduleName({ name: '  ', prompt: '  ' })).toBe('Untitled schedule');
  });
});

describe('where a schedule stands', () => {
  it('reads the switch before the state word', () => {
    expect(scheduleState({ enabled: false, state: 'scheduled' })).toBe('paused');
  });

  it('reads a paused schedule as paused', () => {
    expect(scheduleState({ state: 'paused' })).toBe('paused');
  });

  it('reads a schedule that ran all its times as done', () => {
    expect(scheduleState({ state: 'completed' })).toBe('done');
    expect(scheduleState({ state: 'done' })).toBe('done');
    expect(scheduleState({ state: 'finished' })).toBe('done');
  });

  it('reads a state word of error as failed', () => {
    expect(scheduleState({ state: 'error' })).toBe('failed');
    expect(scheduleState({ state: 'failed' })).toBe('failed');
  });

  it('keeps a scheduled job that failed last time, and calls it failed', () => {
    expect(scheduleState({ state: 'scheduled', last_status: 'error' })).toBe(
      'failed',
    );
    expect(scheduleState({ state: 'scheduled', last_status: 'ok' })).toBe(
      'scheduled',
    );
    expect(scheduleState({ state: 'active' })).toBe('scheduled');
    expect(scheduleState({ state: 'enabled' })).toBe('scheduled');
  });

  it('reads a failure from the last run alone', () => {
    expect(scheduleState({ last_status: 'error' })).toBe('failed');
    expect(scheduleState({ last_status: 'failed' })).toBe('failed');
  });

  it('says it does not know when the host said nothing usable', () => {
    expect(scheduleState({})).toBe('unknown');
    expect(scheduleState({ state: 'somewhere-else' })).toBe('unknown');
  });
});

describe('the distance to a moment', () => {
  it('reads a moment now as now', () => {
    expect(distance(NOW + 10_000, NOW)).toBe('now');
    expect(distance(NOW - 10_000, NOW)).toBe('now');
  });

  it('counts minutes ahead, then hours, then days', () => {
    expect(distance(NOW + 12 * 60_000, NOW)).toBe('in 12 min');
    expect(distance(NOW + 2 * 3_600_000, NOW)).toBe('in 2 h');
    expect(distance(NOW + 3 * 86_400_000, NOW)).toBe('in 3 d');
  });

  it('counts the same behind', () => {
    expect(distance(NOW - 12 * 60_000, NOW)).toBe('12 min ago');
    expect(distance(NOW - 2 * 3_600_000, NOW)).toBe('2 h ago');
  });

  it('says nothing about a moment that is not there', () => {
    expect(distance(0, NOW)).toBe('');
  });

  it('turns a date the host wrote into a moment, or into nothing', () => {
    expect(moment('2026-10-28T13:00:00+01:00')).toBe(NOW + 3_600_000);
    expect(moment('')).toBe(0);
    expect(moment('not a date')).toBe(0);
  });
});

describe('the words of a row', () => {
  it('keeps a run that worked apart from a delivery that did not', () => {
    expect(
      lastRunText(
        row({ lastStatus: 'ok', lastDeliveryError: 'nova did not answer' }),
        NOW,
      ),
    ).toBe('ran 1 h ago, but the delivery failed: nova did not answer');
  });

  it('does not dress a failed run as a delivery problem', () => {
    expect(
      lastRunText(
        row({
          lastStatus: 'error',
          lastError: 'quota',
          lastDeliveryError: 'nova did not answer',
        }),
        NOW,
      ),
    ).toBe('failed 1 h ago: quota');
  });
});

describe('what a person typed into the form', () => {
  const draft = {
    name: 'The morning read',
    when: '0 9 * * *',
    prompt: 'Read the inbox.',
    deliver: 'local',
    repeat: '',
  };

  it('takes what the host would take', () => {
    expect(draftProblem(draft)).toBe('');
  });

  it('wants a name, and a name the host will keep', () => {
    expect(draftProblem({ ...draft, name: '  ' })).toBe(
      'A schedule needs a name.',
    );
    expect(draftProblem({ ...draft, name: 'a'.repeat(201) })).toBe(
      'The name is longer than 200 characters.',
    );
  });

  it('wants a time, in any of the shapes the host reads', () => {
    expect(draftProblem({ ...draft, when: '   ' })).toBe(
      'A schedule needs a time: an expression, an interval, or a date.',
    );
  });

  it('holds the line the host holds on the prompt', () => {
    expect(draftProblem({ ...draft, prompt: 'a'.repeat(5001) })).toBe(
      'What it should do is longer than 5000 characters.',
    );
    expect(draftProblem({ ...draft, prompt: 'a'.repeat(5000) })).toBe('');
  });

  it('wants a whole number of runs when one is given', () => {
    expect(draftProblem({ ...draft, repeat: 'three' })).toBe(
      'Repeat is a whole number of runs, 1 or more.',
    );
    expect(draftProblem({ ...draft, repeat: '-2' })).toBe(
      'Repeat is a whole number of runs, 1 or more.',
    );
    expect(draftProblem({ ...draft, repeat: '3' })).toBe('');
  });

  it('gives the host the body it takes, trimmed and with no empty repeat', () => {
    expect(
      draftBody({
        name: '  Nightly  ',
        when: ' every night at 02:00 ',
        prompt: ' Take notes. ',
        deliver: '',
        repeat: '',
      }),
    ).toEqual({
      name: 'Nightly',
      schedule: 'every night at 02:00',
      prompt: 'Take notes.',
      deliver: 'local',
    });
    expect(
      draftBody({ ...draft, deliver: 'bot-chat:nova', repeat: '7' }),
    ).toEqual({
      name: 'The morning read',
      schedule: '0 9 * * *',
      prompt: 'Read the inbox.',
      deliver: 'bot-chat:nova',
      repeat: 7,
    });
  });
});

describe('the words of a row', () => {
  it('says when it runs next, and that a paused one does not', () => {
    expect(nextRunText(row(), NOW)).toBe('in 1 h');
    expect(nextRunText(row({ state: 'paused' }), NOW)).toBe('paused');
    expect(nextRunText(row({ nextRun: 0 }), NOW)).toBe('');
  });

  it('says it never ran when there is no run to read', () => {
    expect(lastRunText(row({ lastRun: 0 }), NOW)).toBe('never run');
  });

  it('says when it ran, and why it failed', () => {
    expect(lastRunText(row(), NOW)).toBe('ran 1 h ago');
    expect(lastRunText(row({ lastStatus: 'success' }), NOW)).toBe(
      'ran 1 h ago',
    );
    expect(
      lastRunText(row({ lastStatus: 'error', lastError: 'quota' }), NOW),
    ).toBe('failed 1 h ago: quota');
    expect(lastRunText(row({ lastStatus: 'error' }), NOW)).toBe(
      'failed 1 h ago',
    );
    expect(lastRunText(row({ lastStatus: 'running' }), NOW)).toBe(
      'ran 1 h ago',
    );
    expect(lastRunText(row({ lastStatus: '', lastRun: 0 }), NOW)).toBe(
      'never run',
    );
  });

  it('says where the result goes', () => {
    expect(deliverText('')).toBe('kept on the host');
    expect(deliverText('local')).toBe('kept on the host');
    expect(deliverText('bot-chat:nova')).toBe("handed to nova's chat");
    expect(deliverText('bot-chat:')).toBe('handed to a chat');
    expect(deliverText('telegram')).toBe('delivered to telegram');
  });
});

describe('the rows, in the order the page draws them', () => {
  it('puts the next run first, then the paused, then the rest', () => {
    const rows = [
      row({ id: 'done', state: 'done', name: 'done' }),
      row({ id: 'later', state: 'scheduled', nextRun: NOW + 2 * 3_600_000 }),
      row({ id: 'paused', state: 'paused', name: 'b' }),
      row({ id: 'unknown', state: 'unknown', name: 'a' }),
      row({ id: 'next', state: 'scheduled', nextRun: NOW + 60_000 }),
      row({ id: 'failed', state: 'failed', name: 'failed' }),
    ];
    expect(sortSchedules(rows).map((entry) => entry.id)).toEqual([
      'next',
      'later',
      'paused',
      'failed',
      'done',
      'unknown',
    ]);
  });

  it('sorts a schedule with no next run after one that has one', () => {
    const rows = [
      row({ id: 'none', state: 'scheduled', nextRun: 0, name: 'z' }),
      row({ id: 'dated', state: 'scheduled', nextRun: NOW + 60_000 }),
    ];
    expect(sortSchedules(rows).map((entry) => entry.id)).toEqual([
      'dated',
      'none',
    ]);
    expect(
      sortSchedules([...rows].reverse()).map((entry) => entry.id),
    ).toEqual(['dated', 'none']);
  });

  it('sorts two paused ones by name, and two over ones by their last run', () => {
    const rows = [
      row({ id: 'p-b', state: 'paused', name: 'b' }),
      row({ id: 'p-a', state: 'paused', name: 'a' }),
      row({ id: 'o-old', state: 'done', name: 'old', lastRun: NOW - 9e6 }),
      row({ id: 'o-new', state: 'done', name: 'new', lastRun: NOW - 1e6 }),
      row({ id: 'o-same', state: 'done', name: 'a', lastRun: NOW - 1e6 }),
    ];
    expect(sortSchedules(rows).map((entry) => entry.id)).toEqual([
      'p-a',
      'p-b',
      'o-same',
      'o-new',
      'o-old',
    ]);
  });
});

describe('the schedules the host answered with', () => {
  it('reads the list out of the answer the gateway gives', () => {
    const rows = readSchedules({
      jobs: [
        { id: 'a', name: 'A', schedule_display: 'every 2h', state: 'scheduled' },
        { id: 'b', name: 'B', state: 'paused', enabled: false },
      ],
    });
    expect(rows.map((entry) => entry.name)).toEqual(['A', 'B']);
    expect(rows[1].state).toBe('paused');
  });

  it('reads a bare list, and a list under data', () => {
    expect(readSchedules([{ id: 'a' }])).toHaveLength(1);
    expect(readSchedules({ data: [{ id: 'a' }] })).toHaveLength(1);
  });

  it('reads nothing out of an answer that is not one', () => {
    expect(readSchedules(null)).toEqual([]);
    expect(readSchedules({})).toEqual([]);
    expect(readSchedules('jobs')).toEqual([]);
    expect(readSchedules({ jobs: 'none' })).toEqual([]);
  });

  it('skips a row with no id, and a row that is not an object', () => {
    expect(readSchedules({ jobs: [null, 3, { name: 'no id' }] })).toEqual([]);
  });

  it('counts the runs the host counted, and keeps the last error', () => {
    const [only] = readSchedules({
      jobs: [
        {
          id: 'a',
          repeat: { completed: 18 },
          last_status: 'error',
          last_error: 'RuntimeError: no quota',
          last_delivery_error: 'nova did not answer',
          schedule: { expression: '0 9 * * *' },
          deliver: 'local',
          no_agent: true,
        },
      ],
    });
    expect(only.completed).toBe(18);
    expect(only.lastError).toBe('RuntimeError: no quota');
    expect(only.lastDeliveryError).toBe('nova did not answer');
    expect(only.expression).toBe('0 9 * * *');
    expect(only.deliver).toBe('local');
    expect(only.noAgent).toBe(true);
  });

  it('reads a count of nothing as nothing', () => {
    const [only] = readSchedules({ jobs: [{ id: 'a', repeat: {} }] });
    expect(only.completed).toBe(0);
    const [other] = readSchedules({ jobs: [{ id: 'b', repeat: { completed: -2 } }] });
    expect(other.completed).toBe(0);
  });
});

describe('a schedule the host is not ticking', () => {
  it('says nothing while every run is on time', () => {
    expect(schedulerStanding([row()], NOW).text).toBe('');
    expect(schedulerStanding([row({ state: 'paused', nextRun: 0 })], NOW).text).toBe(
      '',
    );
  });

  it('gives a tick that is merely in flight its two minutes', () => {
    expect(
      schedulerStanding([row({ nextRun: NOW - 60_000 })], NOW).late,
    ).toBe(0);
  });

  it('names one late run, and the reason nothing fires', () => {
    const standing = schedulerStanding([row({ nextRun: NOW - 3_600_000 })], NOW);
    expect(standing.late).toBe(1);
    expect(standing.text).toContain('One schedule was due and did not run');
    expect(standing.text).toContain('its scheduler is not ticking');
  });

  it('counts them when there are several', () => {
    const standing = schedulerStanding(
      [
        row({ id: 'a', nextRun: NOW - 3_600_000 }),
        row({ id: 'b', nextRun: NOW - 7_200_000 }),
      ],
      NOW,
    );
    expect(standing.late).toBe(2);
    expect(standing.text).toContain('2 schedules were due and did not run');
  });

  it('does not count a schedule with no next run', () => {
    expect(schedulerStanding([row({ nextRun: 0 })], NOW).late).toBe(0);
  });
});

describe('the runs of a schedule', () => {
  it('reads the job out of the session the run wrote', () => {
    expect(runJobOf('cron_abc123_20261028_080000')).toBe('abc123');
    expect(runJobOf('cron_job-with-dashes_20261028_235959')).toBe(
      'job-with-dashes',
    );
  });

  it('does not take a session that is not a run', () => {
    expect(runJobOf('')).toBe('');
    expect(runJobOf('past:1')).toBe('');
    expect(runJobOf('cron_abc123')).toBe('');
    expect(runJobOf('cron_abc123_20261028_0800')).toBe('');
    expect(runJobOf('session:cron_abc_20261028_080000')).toBe('');
  });

  it('groups the runs by job, the newest first', () => {
    const runs = runsByJob([
      { id: 'cron_a_20261028_080000', title: 'A · 08:00', lastActive: 300, messageCount: 12 },
      { id: 'cron_a_20261027_080000', title: 'A · 07:00', lastActive: 100 },
      { id: 'cron_b_20261028_090000', title: '', lastActive: 200 },
      { id: 'past:1', title: 'not a run', lastActive: 999 },
    ]);
    expect(Object.keys(runs).sort()).toEqual(['a', 'b']);
    expect(runs.a.map((run) => run.id)).toEqual([
      'cron_a_20261028_080000',
      'cron_a_20261027_080000',
    ]);
    expect(runs.a[0].messages).toBe(12);
    expect(runs.a[1].messages).toBe(0);
    expect(runs.b[0].title).toBe('A run');
  });

  it('reads a session with no last line as the oldest', () => {
    const runs = runsByJob([
      { id: 'cron_a_20261028_080000', lastActive: 0 },
      { id: 'cron_a_20261027_080000', lastActive: 50 },
    ]);
    expect(runs.a[0].id).toBe('cron_a_20261027_080000');
    expect(runs.a[1].at).toBe(0);
  });

  it('does not trust a session the host wrote badly', () => {
    const runs = runsByJob([
      {
        id: 'cron_a_20261028_080000',
        lastActive: 'yesterday' as unknown as number,
        messageCount: 'many' as unknown as number,
      },
    ]);
    expect(runs.a[0]).toEqual({
      id: 'cron_a_20261028_080000',
      title: 'A run',
      at: 0,
      messages: 0,
    });
  });

  it('reads nothing out of nothing', () => {
    expect(runsByJob(undefined)).toEqual({});
    expect(runsByJob([])).toEqual({});
  });
});

describe('the page with nothing to draw', () => {
  it('names the bot the list is empty for', () => {
    expect(emptyText('nova')).toBe('The host holds no schedule for nova yet.');
    expect(emptyText('')).toBe(
      'The host holds no schedule for the default bot yet.',
    );
  });
});
