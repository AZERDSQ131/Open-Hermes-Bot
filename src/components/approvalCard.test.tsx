import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalCard } from './ApprovalCard';
import type { ApprovalRequest } from '../approvals';

const HELD: ApprovalRequest = {
  requestId: 'turn-1',
  runId: 'run-7',
  approvalId: 'req-2',
  executionGeneration: 4,
  command: 'rm -rf build && npm run build',
  description: 'Clear the build output.',
  choices: ['once', 'session', 'always', 'deny'],
};

describe('the approval card', () => {
  it('shows the command, why it is held, and the answers offered', () => {
    render(<ApprovalCard approval={HELD} botName="Patch" onRespond={vi.fn()} />);
    expect(screen.getByText('Patch needs your approval')).toBeTruthy();
    expect(screen.getByText('Clear the build output.')).toBeTruthy();
    expect(screen.getByText('rm -rf build && npm run build')).toBeTruthy();
    expect(screen.getByText('Allow once')).toBeTruthy();
    expect(screen.getByText('For this session')).toBeTruthy();
    expect(screen.getByText('Always allow')).toBeTruthy();
    expect(screen.getByText('Deny')).toBeTruthy();
  });

  it('sends the answer that was pressed', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn(async () => ({ ok: true }));
    render(<ApprovalCard approval={HELD} onRespond={onRespond} />);
    await user.click(screen.getByText('Always allow'));
    expect(onRespond).toHaveBeenCalledWith('always');
  });

  it('keeps the card and says why when the host refuses the answer', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn(async () => ({
      ok: false,
      error: 'The run is no longer waiting',
    }));
    render(<ApprovalCard approval={HELD} onRespond={onRespond} />);
    await user.click(screen.getByText('Deny'));
    await waitFor(() =>
      expect(screen.getByText('The run is no longer waiting')).toBeTruthy(),
    );
    // The card is still answerable: a refusal is not a dead end.
    expect(screen.getByText('Allow once')).toBeTruthy();
  });

  it('offers no deny button when the host did not', () => {
    render(
      <ApprovalCard
        approval={{ ...HELD, choices: ['once', 'always'] }}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.queryByText('Deny')).toBeNull();
    expect(screen.getByText('Allow once')).toBeTruthy();
  });

  it('says the command is held, and nothing else, when no reason came', () => {
    render(
      <ApprovalCard
        approval={{ ...HELD, description: '' }}
        onRespond={vi.fn()}
      />,
    );
    expect(
      screen.getByText('This command can change the machine it runs on.'),
    ).toBeTruthy();
  });
});
