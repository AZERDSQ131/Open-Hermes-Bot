// The schedules: what a bot runs on its own, and when.
//
// A schedule lives on the host, in `cron/jobs.json`, and the gateway's
// scheduler ticks it: the app neither keeps one nor runs one. What it does
// is read them and say where each one stands, so a person can see that the
// bot they set up is still working when they are not looking.
//
// The rules of that reading are here, apart from the interface, so they are
// covered to the line: the words of a schedule, the distance to its next
// run, and the one thing the page must never hide — a schedule the host is
// not ticking.

import type { HermesJob } from './hermes';

/** Where a schedule stands, as the page reads it. */
export type ScheduleState =
  /** It is on, and the host will run it. */
  | 'scheduled'
  /** It is off: the host holds it and does not run it. */
  | 'paused'
  /** It ran as many times as it was made for. */
  | 'done'
  /** Its last run failed. */
  | 'failed'
  /** The host did not say anything the page can stand on. */
  | 'unknown';

/** One schedule, as the page draws it. */
export type Schedule = {
  /** The name the host gives it. */
  id: string;
  /** What the person reads first. */
  name: string;
  /** When it runs, in the host's own words. */
  when: string;
  /** The expression behind it, when the host keeps one: what a person edits. */
  expression: string;
  /** Where it stands. */
  state: ScheduleState;
  /** When it runs next, in milliseconds since the epoch; 0 when none. */
  nextRun: number;
  /** When it ran last, in milliseconds since the epoch; 0 when never. */
  lastRun: number;
  /** The host's word for the last attempt: `ok`, `error`, or nothing. */
  lastStatus: string;
  /** What the last attempt said when it failed. */
  lastError: string;
  /**
   * What the delivery said when it failed.
   *
   * A run can succeed and still reach nobody: Hermes keeps the two apart,
   * and flattening them into one red dot would hide the case where the bot
   * did the work and the result went nowhere.
   */
  lastDeliveryError: string;
  /** Where the result goes. */
  deliver: string;
  /** A schedule that runs a script rather than an agent. */
  noAgent: boolean;
  /** How many times it has run, when the host counts. */
  completed: number;
};

/** A word the host gave, trimmed; never the string "undefined". */
function word(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** A count the host gave, or 0. */
function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * When a schedule runs, in words.
 *
 * The host writes its own display line, and that is the one to show: an
 * expression is read in the host's timezone, which the app does not share.
 * The rest is a fallback for a host that only gave the shape.
 */
export function scheduleText(job: HermesJob): string {
  const shown = word(job?.schedule_display);
  if (shown) return shown;
  const shape = job?.schedule;
  if (!shape || typeof shape !== 'object') return '';
  const display = word((shape as { display?: unknown }).display);
  if (display) return display;
  const expression = word((shape as { expression?: unknown }).expression);
  if (expression) return expression;
  const minutes = count((shape as { minutes?: unknown }).minutes);
  if (minutes) {
    if (minutes % 1440 === 0) return `every ${minutes / 1440}d`;
    if (minutes % 60 === 0) return `every ${minutes / 60}h`;
    return `every ${minutes}m`;
  }
  return '';
}

/**
 * The first words of what a schedule asks for, when it has no name.
 *
 * The host names a job when a person names it; one added from a terminal can
 * have a prompt and no name, and a row with no name at all is not a row.
 */
export function scheduleName(job: HermesJob): string {
  const named = word(job?.name);
  if (named) return named;
  const asked = word(job?.prompt).split('\n')[0].trim();
  if (!asked) return 'Untitled schedule';
  return asked.length > 64 ? `${asked.slice(0, 61)}...` : asked;
}

/** Where a schedule stands, read out of what the host answered. */
export function scheduleState(job: HermesJob): ScheduleState {
  const state = word(job?.state).toLowerCase();
  const last = word(job?.last_status).toLowerCase();
  // A schedule that is off does not run, whatever else it says: the switch
  // is the truth, and a paused job keeps its old state word for a while.
  if (job?.enabled === false) return 'paused';
  if (state === 'paused') return 'paused';
  if (state === 'completed' || state === 'done' || state === 'finished') {
    return 'done';
  }
  if (state === 'error' || state === 'failed') return 'failed';
  if (state === 'scheduled' || state === 'active' || state === 'enabled') {
    // A job on its way to the next run that failed the last one still runs:
    // the failure is worth reading, and it does not take the row away.
    return last === 'error' || last === 'failed' ? 'failed' : 'scheduled';
  }
  if (last === 'error' || last === 'failed') return 'failed';
  return 'unknown';
}

/**
 * The expression behind a schedule, when the host kept one.
 *
 * A cron job carries either an expression, an interval or a one-shot date,
 * and the app shows the display line either way. This is for the person who
 * wants to know what will actually be parsed, and for the form, which edits
 * the expression rather than the sentence.
 */
export function scheduleExpression(job: HermesJob): string {
  const shape = job?.schedule;
  if (!shape || typeof shape !== 'object') return '';
  return word((shape as { expression?: unknown }).expression);
}

/** Milliseconds since the epoch, or 0 when the host gave no usable date. */
export function moment(value: unknown): number {
  const text = word(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The distance to a moment, in words: `in 12 min`, `3 h ago`, `now`.
 *
 * Short on purpose: it sits at the end of a row, and it is read at a glance.
 */
export function distance(at: number, now: number): string {
  if (!at) return '';
  const delta = at - now;
  const size = Math.abs(delta);
  if (size < 45_000) return 'now';
  const ahead = delta > 0;
  const minutes = Math.round(size / 60_000);
  let span = `${minutes} min`;
  if (minutes >= 1440) span = `${Math.round(minutes / 1440)} d`;
  else if (minutes >= 60) span = `${Math.round(minutes / 60)} h`;
  return ahead ? `in ${span}` : `${span} ago`;
}

/** When a schedule runs next, as the row says it. */
export function nextRunText(schedule: Schedule, now: number): string {
  if (schedule.state === 'paused') return 'paused';
  if (!schedule.nextRun) return '';
  return distance(schedule.nextRun, now);
}

/**
 * The last attempt, as the row says it.
 *
 * The host keeps a word for it and, when it failed, the reason. Both are
 * worth showing: a bot that fails every night is the thing this page exists
 * to make visible.
 */
export function lastRunText(schedule: Schedule, now: number): string {
  if (!schedule.lastRun) return 'never run';
  const when = distance(schedule.lastRun, now);
  const status = schedule.lastStatus.toLowerCase();
  if (status === 'error' || status === 'failed') {
    return schedule.lastError
      ? `failed ${when}: ${schedule.lastError}`
      : `failed ${when}`;
  }
  // The work was done and the result went nowhere: Hermes keeps that apart
  // from a failed run, and so does the row. Saying "ran" here would be a
  // half-truth the person cannot see through.
  if (schedule.lastDeliveryError) {
    return `ran ${when}, but the delivery failed: ${schedule.lastDeliveryError}`;
  }
  // The date is there: the early return above took the case of no run.
  return `ran ${when}`;
}

/** What a person typed into the form, before it becomes a schedule. */
export type ScheduleDraft = {
  name: string;
  when: string;
  prompt: string;
  deliver: string;
  /** How many runs, when it is a one-shot series; kept as typed. */
  repeat: string;
};

/**
 * The limits the host enforces, said before the host has to.
 *
 * The gateway answers `400` with its own words, and those are shown too; this
 * is only so that a name left empty does not cost a round trip.
 */
export function draftProblem(draft: ScheduleDraft): string {
  const name = word(draft.name);
  if (!name) return 'A schedule needs a name.';
  if (name.length > 200) return 'The name is longer than 200 characters.';
  if (!word(draft.when)) {
    return 'A schedule needs a time: an expression, an interval, or a date.';
  }
  if (word(draft.prompt).length > 5000) {
    return 'What it should do is longer than 5000 characters.';
  }
  const repeat = word(draft.repeat);
  if (repeat && !/^\d+$/.test(repeat)) {
    return 'Repeat is a whole number of runs, 1 or more.';
  }
  return '';
}

/** What the host is given, out of what the person typed. */
export function draftBody(draft: ScheduleDraft): {
  name: string;
  schedule: string;
  prompt: string;
  deliver: string;
  repeat?: number;
} {
  const body: {
    name: string;
    schedule: string;
    prompt: string;
    deliver: string;
    repeat?: number;
  } = {
    name: word(draft.name),
    schedule: word(draft.when),
    prompt: word(draft.prompt),
    deliver: word(draft.deliver) || 'local',
  };
  const repeat = word(draft.repeat);
  if (repeat) body.repeat = Number(repeat);
  return body;
}

/**
 * One run of a schedule, as the host keeps it.
 *
 * An agent run is a conversation of its own: Hermes opens the session
 * `cron_<job>_<date>_<time>` for it, titles it after the job and the hour,
 * and the app already knows how to read a session back. So a run is not a
 * new kind of object here; it is a thread, opened like any other.
 */
export type ScheduleRun = {
  /** The session the run wrote. */
  id: string;
  /** What the host called it: the job, and the hour it ran. */
  title: string;
  /** Epoch milliseconds of its last line. */
  at: number;
  /** How many lines it holds. */
  messages: number;
};

/**
 * The job a session belongs to, out of the name the host gave it.
 *
 * The id is `cron_<job>_<YYYYMMDD>_<HHMMSS>`, and the job id is whatever
 * sits between the prefix and the date. Anything else is not a run, and a
 * session that merely mentions cron in its title is not one either.
 */
export function runJobOf(sessionId: string): string {
  const match = /^cron_(.+)_\d{8}_\d{6}$/.exec(word(sessionId));
  return match ? match[1] : '';
}

/**
 * The runs of every schedule, newest first, by job id.
 *
 * The host gives the sessions of a profile; which job each belongs to is in
 * the id. Only the agent runs are here: a script-only job writes no session,
 * and its output stays in `cron/output/<job>/` on the host.
 */
export function runsByJob(
  sessions: { id?: string; title?: string; lastActive?: number; messageCount?: number }[] | undefined,
): Record<string, ScheduleRun[]> {
  const runs: Record<string, ScheduleRun[]> = {};
  for (const session of sessions ?? []) {
    const id = word(session?.id);
    const job = runJobOf(id);
    if (!job) continue;
    const at = Number(session?.lastActive);
    (runs[job] ??= []).push({
      id,
      title: word(session?.title) || 'A run',
      at: Number.isFinite(at) ? at : 0,
      messages: Number(session?.messageCount) || 0,
    });
  }
  for (const list of Object.values(runs)) {
    list.sort((left, right) => right.at - left.at);
  }
  return runs;
}

/** Where the result of a run goes, in the page's words. */
export function deliverText(deliver: string): string {
  const where = word(deliver).toLowerCase();
  if (!where || where === 'local') return 'kept on the host';
  if (where.startsWith('bot-chat:')) {
    const bot = deliver.slice('bot-chat:'.length).trim();
    return bot ? `handed to ${bot}'s chat` : 'handed to a chat';
  }
  return `delivered to ${deliver}`;
}

/**
 * The rows, in the order the page draws them.
 *
 * The ones that are coming first, the nearest run at the top, because that
 * is what a person opens the page for; then the ones that are off; then the
 * ones that are over or broken, the most recent first.
 */
export function sortSchedules(rows: Schedule[]): Schedule[] {
  const rank: Record<ScheduleState, number> = {
    scheduled: 0,
    paused: 1,
    failed: 2,
    done: 3,
    unknown: 4,
  };
  return [...rows].sort((left, right) => {
    if (rank[left.state] !== rank[right.state]) {
      return rank[left.state] - rank[right.state];
    }
    if (left.state === 'scheduled') {
      // No date sorts after a date: a schedule the host gave no next run
      // for is not the next thing that happens.
      if (left.nextRun !== right.nextRun) {
        if (!left.nextRun) return 1;
        if (!right.nextRun) return -1;
        return left.nextRun - right.nextRun;
      }
    }
    if (left.state === 'paused' || left.state === 'unknown') {
      return left.name.localeCompare(right.name);
    }
    if (left.lastRun !== right.lastRun) return right.lastRun - left.lastRun;
    return left.name.localeCompare(right.name);
  });
}

/**
 * The schedules of the host, read out of what it answered.
 *
 * The answer is `{ jobs: [...] }`, and the app reads it defensively: a host
 * one version behind may carry a field this page does not know, and a row
 * without an id is not one it can act on.
 */
export function readSchedules(payload: unknown): Schedule[] {
  const raw = Array.isArray(payload)
    ? payload
    : ((payload as { jobs?: unknown; data?: unknown } | null)?.jobs ??
      (payload as { data?: unknown } | null)?.data);
  if (!Array.isArray(raw)) return [];
  const rows: Schedule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const job = entry as HermesJob;
    const id = word(job.id);
    if (!id) continue;
    const repeat = (job.repeat ?? {}) as { completed?: unknown };
    rows.push({
      id,
      name: scheduleName(job),
      when: scheduleText(job),
      expression: scheduleExpression(job),
      state: scheduleState(job),
      nextRun: moment(job.next_run_at),
      lastRun: moment(job.last_run_at),
      lastStatus: word(job.last_status),
      lastError: word(job.last_error),
      lastDeliveryError: word(job.last_delivery_error),
      deliver: word(job.deliver),
      noAgent: Boolean(job.no_agent),
      completed: count(repeat.completed),
    });
  }
  return sortSchedules(rows);
}

/**
 * The one thing the page must not hide: a schedule the host is not ticking.
 *
 * A run is late when it was due and is not done; a couple of minutes of
 * slack keeps a tick that is merely in flight from reading as a fault. The
 * gateway answers, so what is stopped is its scheduler, not the host: a
 * schedule does not fire while it is, and saying so is the difference
 * between a page that reassures and a page that lies.
 */
export function schedulerStanding(
  rows: Schedule[],
  now: number,
): { late: number; text: string } {
  const late = rows.filter(
    (row) =>
      row.state === 'scheduled' && row.nextRun > 0 && now - row.nextRun > 120_000,
  ).length;
  if (!late) return { late: 0, text: '' };
  return {
    late,
    text:
      late === 1
        ? 'One schedule was due and did not run: the gateway answers, but its scheduler is not ticking. Nothing fires while it is stopped.'
        : `${late} schedules were due and did not run: the gateway answers, but its scheduler is not ticking. Nothing fires while it is stopped.`,
  };
}

/** What the page says above a list that is empty. */
export function emptyText(profile: string): string {
  const who = word(profile);
  return who
    ? `The host holds no schedule for ${who} yet.`
    : 'The host holds no schedule for the default bot yet.';
}
