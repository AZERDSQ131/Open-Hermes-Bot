import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAgentDialog, toProfileId } from './CreateAgentDialog';
import { EditAgentDialog } from './EditAgentDialog';
import type { CreateCandidate } from './CreateAgentDialog';
import type { Thread } from '../data';

const candidates: CreateCandidate[] = [
  {
    id: 'bot:bob',
    name: 'Bob',
    profile: 'bob',
    avatar: { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
  },
  {
    id: 'bot:alice',
    name: 'Alice',
    profile: 'alice',
    avatar: { color: '#4f9d8f', shape: 'galet', variant: 'neutral' },
  },
];

describe('the name a bot gets on the server', () => {
  it('is a profile id', () => {
    expect(toProfileId('Bob')).toBe('bob');
    expect(toProfileId('  Jean-Luc Mélenchon ')).toBe('jean-luc-melenchon');
    expect(toProfileId('Bot #2')).toBe('bot-2');
    expect(toProfileId('---')).toBe('');
  });
});

describe('the dialog that creates a bot', () => {
  it('asks for a name before it creates anything', async () => {
    const onCreateBot = vi.fn(async () => ({ ok: true as const }));
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={() => undefined}
        onCreateBot={onCreateBot}
        onCreateGroup={() => undefined}
      />,
    );
    expect(screen.getByText('Create bot')).toBeTruthy();
    const submit = screen.getByText('Create bot', { selector: 'button' });
    expect(submit).toHaveProperty('disabled', true);
  });

  it('creates the bot with the name and the face that were chosen', async () => {
    const onCreateBot = vi.fn(async () => ({ ok: true as const }));
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={() => undefined}
        onCreateBot={onCreateBot}
        onCreateGroup={() => undefined}
      />,
    );
    const input = screen.getByLabelText(/Bot name/i);
    await userEvent.type(input, 'Nova');
    await userEvent.click(screen.getByLabelText('Pebble'));
    await userEvent.click(
      screen.getByText('Create bot', { selector: 'button' }),
    );
    await waitFor(() => expect(onCreateBot).toHaveBeenCalled());
    const call = onCreateBot.mock.calls[0][0];
    expect(call.name).toBe('Nova');
    expect(call.shape).toBe('galet');
  });

  it('says what went wrong when the bot could not be created', async () => {
    const onCreateBot = vi.fn(async () => ({
      ok: false as const,
      error: 'the name is taken',
    }));
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={() => undefined}
        onCreateBot={onCreateBot}
        onCreateGroup={() => undefined}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Bot name/i), 'Nova');
    await userEvent.click(
      screen.getByText('Create bot', { selector: 'button' }),
    );
    await waitFor(() =>
      expect(screen.getByText('the name is taken')).toBeTruthy(),
    );
  });

  it('builds a group out of the bots that were picked', async () => {
    const onCreateGroup = vi.fn();
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={() => undefined}
        onCreateBot={vi.fn(async () => ({ ok: true as const }))}
        onCreateGroup={onCreateGroup}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Group' }));
    await userEvent.type(screen.getByLabelText(/Group name/i), 'The crew');
    await userEvent.click(screen.getByText('Bob'));
    await userEvent.click(screen.getByText('Alice'));
    await userEvent.click(
      screen.getByText('Create group', { selector: 'button' }),
    );
    await waitFor(() => expect(onCreateGroup).toHaveBeenCalled());
    const call = onCreateGroup.mock.calls[0][0];
    expect(call.name).toBe('The crew');
    expect(call.members.map((member: { name: string }) => member.name)).toEqual([
      'Bob',
      'Alice',
    ]);
  });

  it('wants two bots before it builds a group', async () => {
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={() => undefined}
        onCreateBot={vi.fn(async () => ({ ok: true as const }))}
        onCreateGroup={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Group' }));
    const submit = screen.getByText('Create group', { selector: 'button' });
    expect(submit).toHaveProperty('disabled', true);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <CreateAgentDialog
        candidates={candidates}
        onClose={onClose}
        onCreateBot={vi.fn(async () => ({ ok: true as const }))}
        onCreateGroup={() => undefined}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the dialog that edits a bot', () => {
  const thread: Thread = {
    id: 'bot:bob',
    name: 'Bob',
    profile: 'bob',
    avatar: { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
    preview: '',
    time: '',
    chatTime: '',
    messages: [],
  };

  it('shows the name and the face of the bot', () => {
    render(
      <EditAgentDialog
        thread={thread}
        onClose={() => undefined}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue('Bob')).toBeTruthy();
  });

  it('saves the new name and the new face', async () => {
    const onSave = vi.fn();
    render(
      <EditAgentDialog
        thread={thread}
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    const input = screen.getByDisplayValue('Bob');
    await userEvent.clear(input);
    await userEvent.type(input, 'Bobby');
    await userEvent.click(screen.getByLabelText('Squircle'));
    await userEvent.click(screen.getByText('Save changes'));
    expect(onSave).toHaveBeenCalled();
    const call = onSave.mock.calls[0][0];
    expect(call.name).toBe('Bobby');
    expect(call.avatar.shape).toBe('squircle');
  });

  it('keeps the name of the default bot', () => {
    const onSave = vi.fn();
    render(
      <EditAgentDialog
        thread={thread}
        nameLocked
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    expect(screen.getByDisplayValue('Bob')).toHaveProperty('disabled', true);
  });

  it('edits the members of a group one by one', async () => {
    const onSave = vi.fn();
    const group: Thread = {
      ...thread,
      id: 'group:crew',
      name: 'The crew',
      members: [
        { id: 'bot:bob', name: 'Bob', profile: 'bob', avatar: { color: '#e8483f', shape: 'cercle', variant: 'neutral' } },
        { id: 'bot:alice', name: 'Alice', profile: 'alice', avatar: { color: '#4f9d8f', shape: 'galet', variant: 'neutral' } },
      ],
      avatar: {
        kind: 'group',
        members: [
          { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
          { color: '#4f9d8f', shape: 'galet', variant: 'neutral' },
        ],
      },
    };
    render(
      <EditAgentDialog thread={group} onClose={() => undefined} onSave={onSave} />,
    );
    await userEvent.click(screen.getByLabelText('Edit member 2'));
    await userEvent.click(screen.getByLabelText('Capsule'));
    await userEvent.click(screen.getByText('Save changes'));
    expect(onSave).toHaveBeenCalled();
    const call = onSave.mock.calls[0][0];
    expect(call.avatar.kind).toBe('group');
    if (call.avatar.kind === 'group') {
      expect(call.avatar.members[1].shape).toBe('capsule');
    }
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <EditAgentDialog
        thread={thread}
        onClose={onClose}
        onSave={() => undefined}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
