import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProfilePicker } from './ProfilePicker';
import {
  deliverText,
  distance,
  draftBody,
  draftProblem,
  emptyText,
  lastRunText,
  nextRunText,
  readSchedules,
  runsByJob,
  schedulerStanding,
  type Schedule,
  type ScheduleDraft,
  type ScheduleRun,
  type ScheduleState,
} from '../schedules';

/** The word a row carries, for each place a schedule can stand. */
const STATE_TEXT: Record<ScheduleState, string> = {
  scheduled: 'Scheduled',
  paused: 'Paused',
  done: 'Done',
  failed: 'Failed',
  unknown: 'Unknown',
};

/** How many runs a row offers before it points at the bot's history. */
const RUNS_SHOWN = 5;

/** A form with nothing in it, which is how a new schedule starts. */
const EMPTY_DRAFT: ScheduleDraft = {
  name: '',
  when: '',
  prompt: '',
  deliver: 'local',
  repeat: '',
};

/**
 * The schedules: what a bot runs on its own when nobody is watching.
 *
 * They live in the host's `cron/jobs.json`, where the gateway's scheduler
 * ticks them every minute. The app reads them on the API it already talks
 * to, creates one there, turns one off or back on, and asks for a run; it
 * keeps nothing of its own, and it does not run anything itself.
 *
 * The page has one duty beyond drawing rows: a schedule that was due and
 * did not run is a bot that has quietly stopped working, so it says so.
 */
export function SchedulesSettings({
  onOpenRun,
}: {
  /** Where a run is read: the conversation it wrote, opened by the app. */
  onOpenRun?: (profile: string, run: ScheduleRun) => void;
} = {}) {
  const bridge = window.hermes;
  const [profile, setProfile] = useState('');
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bots, setBots] = useState<{ name: string; title: string }[]>([]);
  const [runs, setRuns] = useState<Record<string, ScheduleRun[]>>({});
  const [openRuns, setOpenRuns] = useState('');
  // The distance to a run is read against the clock, and the clock moves:
  // half a minute is enough to keep "in 3 min" true without redrawing for
  // nothing.
  const [now, setNow] = useState(() => Date.now());

  const read = useCallback(async () => {
    const reader = bridge?.jobs;
    if (!reader) return;
    try {
      const answer = await reader({ profile });
      setRows(readSchedules(answer?.jobs));
      // A run is a conversation, so the runs of a schedule are the sessions
      // of the profile whose id carries the job. They are read beside the
      // schedules, and a host that answers nothing usable leaves them out.
      let past = null;
      try {
        past = (await bridge?.history?.({ profile })) ?? null;
      } catch {
        past = null;
      }
      setRuns(runsByJob(past?.sessions));
      setError(answer?.error ?? '');
      // A host that has no cron module is not a broken connection: it is a
      // Hermes that was installed without it, and the page says which.
      setHint(
        answer?.status === 501
          ? 'That host runs a Hermes without its cron module.'
          : '',
      );
    } catch (reason) {
      setRows([]);
      setError(reason instanceof Error ? reason.message : 'The schedules could not be read.');
    }
  }, [bridge, profile]);

  useEffect(() => {
    setRows(null);
    setNotice('');
    void read();
  }, [read]);

  // The chats a result can be handed to: the primary bot, then the profiles.
  useEffect(() => {
    let live = true;
    bridge
      ?.profiles?.()
      .then((answer) => {
        if (!live) return;
        const others = (answer?.profiles ?? []).map((bot) => ({
          name: bot.name,
          title: bot.title || bot.name,
        }));
        const primary = answer?.primary;
        setBots([
          ...(primary
            ? [{ name: '', title: primary.title || 'Chief of Staff' }]
            : []),
          ...others,
        ]);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [bridge]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(ticker);
  }, []);

  const standing = useMemo(
    () => schedulerStanding(rows ?? [], now),
    [rows, now],
  );

  /**
   * A schedule is turned off on the host, where it runs.
   *
   * The row moves at once, because a page that waits on a round trip reads
   * as a page that did nothing; and it moves back if the host says no.
   */
  async function setPaused(schedule: Schedule, paused: boolean) {
    const action = paused ? bridge?.pauseJob : bridge?.resumeJob;
    if (!action) return;
    setBusy(schedule.id);
    setError('');
    setNotice('');
    setRows((current) =>
      (current ?? []).map((row) =>
        row.id === schedule.id
          ? { ...row, state: paused ? 'paused' : 'scheduled' }
          : row,
      ),
    );
    try {
      const result = await action({ jobId: schedule.id, profile });
      if (!result.ok) {
        setError(result.error ?? 'The schedule could not be changed.');
        setRows((current) =>
          (current ?? []).map((row) =>
            row.id === schedule.id ? schedule : row,
          ),
        );
        return;
      }
      // The host is the truth, and it may have moved the next run while it
      // answered: it is read again rather than guessed at.
      await read();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The schedule could not be changed.',
      );
      setRows((current) =>
        (current ?? []).map((row) => (row.id === schedule.id ? schedule : row)),
      );
    } finally {
      setBusy('');
    }
  }

  /**
   * A run is asked for, not performed.
   *
   * The host answers at once and fires the job on its next tick, so the page
   * says what it asked rather than pretending the run is behind us. When the
   * scheduler is stopped nothing fires, and the standing line above the list
   * is what says so.
   */
  async function runNow(schedule: Schedule) {
    const runner = bridge?.runJob;
    if (!runner) return;
    setBusy(schedule.id);
    setError('');
    setNotice('');
    try {
      const result = await runner({ jobId: schedule.id, profile });
      if (!result.ok) {
        setError(result.error ?? 'The schedule could not be asked to run.');
        return;
      }
      setNotice(
        `Asked the host to run "${schedule.name}" now. It fires on the next tick, within a minute when the scheduler is running.`,
      );
      await read();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The schedule could not be asked to run.',
      );
    } finally {
      setBusy('');
    }
  }

  /** A schedule is made on the host, out of what the form holds. */
  async function create() {
    const problem = draftProblem(draft);
    setDraftError(problem);
    if (problem) return;
    const writer = bridge?.createJob;
    if (!writer) return;
    setCreating(true);
    try {
      const answer = await writer({ ...draftBody(draft), profile });
      if (!answer.ok) {
        setDraftError(answer.error ?? 'The host did not create that schedule.');
        return;
      }
      setDraft(EMPTY_DRAFT);
      setFormOpen(false);
      setNotice('The host holds it now: it is on the list below.');
      await read();
    } catch (reason) {
      setDraftError(
        reason instanceof Error
          ? reason.message
          : 'The host did not create that schedule.',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Schedules</h2>
          <p>
            What a bot runs on its own, on the host. The app draws them; the
            host's scheduler is what fires them.
          </p>
        </div>
      </header>

      <ProfilePicker
        value={profile}
        onChange={setProfile}
        label="Whose schedules?"
      />

      {error ? <p className="models-error">{error}</p> : null}
      {hint ? <p className="settings-hint">{hint}</p> : null}
      {notice ? <p className="settings-hint">{notice}</p> : null}

      {standing.text ? (
        <p className="schedule-late" role="status">
          {standing.text}
        </p>
      ) : null}

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>The schedules</h3>
            <p>
              A schedule that is off is still there, and does not run. Its
              times are the host's own, in the host's timezone.
            </p>
          </div>
          <button
            type="button"
            className="settings-action is-small"
            onClick={() => {
              setFormOpen((open) => !open);
              setDraftError('');
            }}
          >
            {formOpen ? 'Close' : 'New schedule'}
          </button>
        </header>

        {formOpen ? (
          <div className="settings-form schedule-form">
            <div className="settings-field-grid">
              <label className="settings-field">
                <span className="settings-field-label">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  placeholder="The morning read"
                  disabled={creating}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">When</span>
                <input
                  type="text"
                  value={draft.when}
                  placeholder="0 9 * * *"
                  spellCheck={false}
                  disabled={creating}
                  onChange={(event) =>
                    setDraft({ ...draft, when: event.target.value })
                  }
                />
                <span className="settings-field-note">
                  An expression, an interval, a phrase or a date. Read in the
                  host's own timezone: nine there, not here.
                </span>
              </label>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">What it should do</span>
              <textarea
                value={draft.prompt}
                rows={3}
                placeholder="Read the inbox, and answer what can be answered."
                disabled={creating}
                onChange={(event) =>
                  setDraft({ ...draft, prompt: event.target.value })
                }
              />
            </label>

            <div className="settings-field-grid">
              <label className="settings-field">
                <span className="settings-field-label">Hand the result to</span>
                <select
                  value={draft.deliver}
                  disabled={creating}
                  onChange={(event) =>
                    setDraft({ ...draft, deliver: event.target.value })
                  }
                >
                  <option value="local">Keep it on the host</option>
                  {bots
                    .filter((bot) => bot.name)
                    .map((bot) => (
                      <option key={bot.name} value={`bot-chat:${bot.name}`}>
                        {bot.title}'s chat
                      </option>
                    ))}
                </select>
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Runs, at most</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.repeat}
                  placeholder="forever"
                  disabled={creating}
                  onChange={(event) =>
                    setDraft({ ...draft, repeat: event.target.value })
                  }
                />
              </label>
            </div>

            {draftError ? <p className="models-error">{draftError}</p> : null}

            <div className="settings-field-actions">
              <button
                type="button"
                className="settings-action"
                disabled={creating}
                onClick={() => void create()}
              >
                {creating ? 'Creating…' : 'Create the schedule'}
              </button>
              <button
                type="button"
                className="settings-text-button"
                disabled={creating}
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setDraftError('');
                }}
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <div className="capability-list">
          {(rows ?? []).map((schedule) => {
            const paused = schedule.state === 'paused';
            const canSwitch =
              schedule.state === 'scheduled' ||
              schedule.state === 'paused' ||
              schedule.state === 'failed';
            // A paused job is not asked to run: the host's own trigger turns
            // it back on as it rearms it, so "run now" would quietly undo the
            // pause. The switch is the honest way back.
            const canRun =
              schedule.state === 'scheduled' || schedule.state === 'failed';
            const runsOf = runs[schedule.id] ?? [];
            const open = openRuns === schedule.id;
            return (
              <div className="schedule-entry" key={schedule.id}>
                <div className="capability-row schedule-row">
                  <span className="capability-copy">
                    <span className="capability-name">{schedule.name}</span>
                    <span className="capability-description">
                      {[
                        schedule.when,
                        schedule.expression &&
                        schedule.expression !== schedule.when
                          ? schedule.expression
                          : '',
                        nextRunText(schedule, now),
                        lastRunText(schedule, now),
                        deliverText(schedule.deliver),
                        schedule.noAgent
                          ? 'a script, its output stays on the host'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {runsOf.length ? (
                      // The runs are a line of their own under the schedule:
                      // a count jammed into a sentence that wraps ends up
                      // starting a line with a separator.
                      <button
                        type="button"
                        className="settings-text-button schedule-runs-link"
                        aria-expanded={open}
                        onClick={() => setOpenRuns(open ? '' : schedule.id)}
                      >
                        {open
                          ? 'hide the runs'
                          : `${runsOf.length} run${runsOf.length === 1 ? '' : 's'}`}
                      </button>
                    ) : null}
                  </span>
                  <span
                    className={`capability-tag schedule-state is-${schedule.state}`}
                  >
                    {STATE_TEXT[schedule.state]}
                  </span>
                  {/* The slot is always there: a row without a run keeps its
                      state and its switch in the same column as the others. */}
                  <span className="schedule-run-slot">
                    {canRun ? (
                      <button
                        type="button"
                        className="settings-text-button schedule-run"
                        disabled={busy === schedule.id}
                        onClick={() => void runNow(schedule)}
                      >
                        {busy === schedule.id ? 'Asking…' : 'Run now'}
                      </button>
                    ) : null}
                  </span>
                  {canSwitch ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!paused}
                      aria-label={`${paused ? 'Resume' : 'Pause'} ${schedule.name}`}
                      className={`settings-switch ${paused ? '' : 'is-on'}`}
                      disabled={busy === schedule.id}
                      onClick={() => void setPaused(schedule, !paused)}
                    >
                      <span className="settings-switch-knob" />
                    </button>
                  ) : null}
                </div>
                {open && runsOf.length ? (
                  <div className="schedule-runs">
                    {runsOf.slice(0, RUNS_SHOWN).map((run) => (
                      <button
                        type="button"
                        className="schedule-run-row"
                        key={run.id}
                        disabled={!onOpenRun}
                        onClick={() => onOpenRun?.(profile, run)}
                      >
                        <span className="schedule-run-title">{run.title}</span>
                        <span className="schedule-run-when">
                          {distance(run.at, now)}
                          {run.messages
                            ? ` · ${run.messages} line${run.messages === 1 ? '' : 's'}`
                            : ''}
                        </span>
                      </button>
                    ))}
                    {runsOf.length > RUNS_SHOWN ? (
                      <p className="settings-hint">
                        {runsOf.length - RUNS_SHOWN} older runs of this schedule
                        are in the past conversations of the bot.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {rows && rows.length === 0 ? (
            <p className="settings-hint">
              {emptyText(profile)} It is made here, and lives on the host from
              then on.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
