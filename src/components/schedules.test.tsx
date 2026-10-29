import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchedulesSettings } from './SchedulesSettings';

/** A date the host writes, an hour from now. */
function after(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function job(over: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    name: 'The morning read',
    schedule_display: 'every 6h',
    state: 'scheduled',
    enabled: true,
    next_run_at: after(1),
    last_run_at: after(-1),
    last_status: 'ok',
    deliver: 'local',
    ...over,
  };
}

function withBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    profiles: vi.fn(async () => ({
      ok: true,
      profiles: [{ name: 'nova', title: 'Nova' }],
      primary: { name: 'chief', title: 'Chief of Staff' },
    })),
    jobs: vi.fn(async () => ({ ok: true, jobs: [job()], status: 200 })),
    pauseJob: vi.fn(async () => ({ ok: true })),
    resumeJob: vi.fn(async () => ({ ok: true })),
    createJob: vi.fn(async () => ({ ok: true, job: { id: 'job-2' } })),
    history: vi.fn(async () => ({ ok: true, sessions: [] })),
    runJob: vi.fn(async () => ({ ok: true, job: { id: 'job-1' } })),
    ...overrides,
  };
  (window as unknown as { hermes: unknown }).hermes = bridge;
  return bridge;
}

describe('the schedules page', () => {
  it('draws a schedule with its words, and where its result goes', async () => {
    withBridge();
    render(<SchedulesSettings />);
    expect(await screen.findByText('The morning read')).toBeTruthy();
    expect(screen.getByText(/every 6h/)).toBeTruthy();
    expect(screen.getByText(/in 1 h/)).toBeTruthy();
    expect(screen.getByText(/ran 1 h ago/)).toBeTruthy();
    expect(screen.getByText(/kept on the host/)).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('says it never ran, and why it failed', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [
          job({ id: 'a', name: 'Broken', last_status: 'error', last_error: 'quota' }),
          job({ id: 'b', name: 'Fresh', last_run_at: null, next_run_at: null }),
        ],
      })),
    });
    render(<SchedulesSettings />);
    expect(await screen.findByText(/failed 1 h ago: quota/)).toBeTruthy();
    expect(screen.getByText(/never run/)).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('says a paused schedule is paused, and does not promise a next run', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ state: 'paused', enabled: false, next_run_at: after(2) })],
      })),
    });
    render(<SchedulesSettings />);
    expect(await screen.findByText('Paused')).toBeTruthy();
    expect(screen.getByText(/paused ·/)).toBeTruthy();
  });

  it('says when the host is answering but its scheduler is not ticking', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ next_run_at: after(-2) })],
      })),
    });
    render(<SchedulesSettings />);
    expect(
      await screen.findByText(/One schedule was due and did not run/),
    ).toBeTruthy();
    expect(screen.getByText(/its scheduler is not ticking/)).toBeTruthy();
  });

  it('turns a schedule off on the host, and draws the host answer', async () => {
    // The host is the truth: the second read answers with the job paused,
    // and the row the page draws is that answer, not its own guess.
    let paused = false;
    const bridge = withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ state: paused ? 'paused' : 'scheduled', enabled: !paused })],
      })),
      pauseJob: vi.fn(async () => {
        paused = true;
        return { ok: true };
      }),
    });
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Pause The morning read' }),
    );
    await waitFor(() => {
      expect(bridge.pauseJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        profile: '',
      });
    });
    expect(await screen.findByText('Paused')).toBeTruthy();
  });

  it('turns a paused one back on', async () => {
    let paused = true;
    const bridge = withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ state: paused ? 'paused' : 'scheduled', enabled: !paused })],
      })),
      resumeJob: vi.fn(async () => {
        paused = false;
        return { ok: true };
      }),
    });
    render(<SchedulesSettings />);
    await screen.findByText('Paused');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Resume The morning read' }),
    );
    await waitFor(() => {
      expect(bridge.resumeJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        profile: '',
      });
    });
    expect(await screen.findByText('Scheduled')).toBeTruthy();
  });

  it('puts the row back when the host refuses the change', async () => {
    withBridge({
      pauseJob: vi.fn(async () => ({
        ok: false,
        error: 'That schedule is gone.',
      })),
      jobs: vi.fn(async () => ({ ok: true, status: 200, jobs: [job()] })),
    });
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Pause The morning read' }),
    );
    expect(await screen.findByText('That schedule is gone.')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('turns a thrown call into a sentence', async () => {
    withBridge({
      jobs: vi.fn(async () => {
        throw new Error('The host closed the door');
      }),
    });
    render(<SchedulesSettings />);
    expect(await screen.findByText('The host closed the door')).toBeTruthy();
  });

  it('reads the list again for another bot', async () => {
    const bridge = withBridge();
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.selectOptions(
      screen.getByRole('combobox'),
      screen.getByRole('option', { name: 'Nova' }),
    );
    await waitFor(() => {
      expect(bridge.jobs).toHaveBeenCalledWith({ profile: 'nova' });
    });
  });

  it('says what an empty list means, and where a schedule is made', async () => {
    withBridge({
      jobs: vi.fn(async () => ({ ok: true, status: 200, jobs: [] })),
    });
    render(<SchedulesSettings />);
    expect(
      await screen.findByText(/holds no schedule for the default bot yet/),
    ).toBeTruthy();
    expect(screen.getByText(/lives on the host from then on/)).toBeTruthy();
  });

  it('says which Hermes has no cron module', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: false,
        jobs: [],
        status: 501,
        error: 'The cron module is not available on this host',
      })),
    });
    render(<SchedulesSettings />);
    expect(
      await screen.findByText(/Hermes without its cron module/),
    ).toBeTruthy();
    expect(
      screen.getByText('The cron module is not available on this host'),
    ).toBeTruthy();
  });

  it('keeps a run that worked apart from a delivery that did not', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [
          job({ last_status: 'ok', last_delivery_error: 'nova did not answer' }),
        ],
      })),
    });
    render(<SchedulesSettings />);
    expect(
      await screen.findByText(/but the delivery failed: nova did not answer/),
    ).toBeTruthy();
  });

  it('asks the host to run one now, and says what it asked', async () => {
    const bridge = withBridge();
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => {
      expect(bridge.runJob).toHaveBeenCalledWith({
        jobId: 'job-1',
        profile: '',
      });
    });
    expect(await screen.findByText(/fires on the next tick/)).toBeTruthy();
  });

  it('does not offer a run on a paused one, which the host would turn on', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ state: 'paused', enabled: false })],
      })),
    });
    render(<SchedulesSettings />);
    await screen.findByText('Paused');
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
  });

  it('makes a schedule on the host out of the form', async () => {
    const bridge = withBridge();
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Nightly notes');
    await userEvent.type(screen.getByLabelText(/^When/), 'every night at 02:00');
    await userEvent.type(screen.getByLabelText('What it should do'), 'Take notes.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create the schedule' }),
    );
    await waitFor(() => {
      expect(bridge.createJob).toHaveBeenCalledWith({
        name: 'Nightly notes',
        schedule: 'every night at 02:00',
        prompt: 'Take notes.',
        deliver: 'local',
        profile: '',
      });
    });
    expect(await screen.findByText(/on the list below/)).toBeTruthy();
  });

  it('shows the host words when it refuses to make one', async () => {
    withBridge({
      createJob: vi.fn(async () => ({
        ok: false,
        status: 400,
        error: 'Schedule is required',
      })),
    });
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Nightly notes');
    await userEvent.type(screen.getByLabelText(/^When/), '0 2 * * *');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create the schedule' }),
    );
    expect(await screen.findByText('Schedule is required')).toBeTruthy();
  });

  it('does not cost a round trip to learn the name is missing', async () => {
    const bridge = withBridge();
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    await userEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    await userEvent.type(screen.getByLabelText(/^When/), '0 2 * * *');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create the schedule' }),
    );
    expect(await screen.findByText('A schedule needs a name.')).toBeTruthy();
    expect(bridge.createJob).not.toHaveBeenCalled();
  });

  it('lists the runs of a schedule, and reads one where the app reads a chat', async () => {
    const opened: { profile: string; id: string }[] = [];
    withBridge({
      history: vi.fn(async () => ({
        ok: true,
        sessions: [
          {
            id: 'cron_job-1_20261028_080000',
            title: 'The morning read · Oct 28 08:00',
            messageCount: 12,
            lastActive: Date.now() - 3_600_000,
            archived: false,
          },
          {
            id: 'cron_job-1_20261027_080000',
            title: 'The morning read · Oct 27 08:00',
            messageCount: 9,
            lastActive: Date.now() - 90_000_000,
            archived: false,
          },
        ],
      })),
    });
    render(
      <SchedulesSettings
        onOpenRun={(profile, run) => opened.push({ profile, id: run.id })}
      />,
    );
    const link = await screen.findByRole('button', { name: '2 runs' });
    await userEvent.click(link);
    expect(
      screen.getByRole('button', { name: /Oct 28 08:00/ }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Oct 27 08:00/ }));
    expect(opened).toEqual([
      { profile: '', id: 'cron_job-1_20261027_080000' },
    ]);
  });

  it('shows no runs for a schedule that has none', async () => {
    withBridge();
    render(<SchedulesSettings />);
    await screen.findByText('The morning read');
    expect(screen.queryByRole('button', { name: /runs?$/ })).toBeNull();
  });

  it('says a script-only run keeps its output on the host', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ no_agent: true, name: 'The backup check' })],
      })),
    });
    render(<SchedulesSettings />);
    expect(
      await screen.findByText(/a script, its output stays on the host/),
    ).toBeTruthy();
  });

  it('says a one-shot that ran all its times is done, with no switch', async () => {
    withBridge({
      jobs: vi.fn(async () => ({
        ok: true,
        status: 200,
        jobs: [job({ state: 'completed', next_run_at: null })],
      })),
    });
    render(<SchedulesSettings />);
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
