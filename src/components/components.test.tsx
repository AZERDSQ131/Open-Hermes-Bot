import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentAvatar } from './AgentAvatar';
import { BloubSvg } from './Bloub';
import { AnimatedBloub } from './AnimatedBloub';
import { MentionText } from './MentionText';
import { ShapeGrid, ColorGrid } from './LogoControls';
import { LogoEditor } from './LogoEditor';
import { ReactionDetails } from './ReactionDetails';
import { ThreadContextMenu } from './ThreadContextMenu';
import type { GroupMember } from '../data';

const bob: GroupMember = {
  id: 'bot:bob',
  name: 'Bob',
  profile: 'bob',
  avatar: { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
};

describe('the face of a bot', () => {
  it('is drawn', () => {
    const { container } = render(
      <BloubSvg color="#e8483f" shape="cercle" variant="neutral" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('is drawn in every shape', () => {
    for (const shape of ['cercle', 'galet', 'squircle'] as const) {
      const { container } = render(
        <BloubSvg color="#e8483f" shape={shape} variant="neutral" />,
      );
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });

  it('moves when it is animated', () => {
    const { container } = render(
      <AnimatedBloub color="#e8483f" shape="cercle" />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('the avatar of a bot', () => {
  it('shows the face of the bot', () => {
    const { container } = render(
      <AgentAvatar avatar={{ color: '#e8483f', shape: 'cercle', variant: 'neutral' }} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('plays the theatre when a mood travels with the call', () => {
    const { container } = render(
      <AgentAvatar
        avatar={{ color: '#e8483f', shape: 'cercle' }}
        mood="running"
      />,
    );
    expect(container.querySelector('.mood-bloub')?.getAttribute('data-mood')).toBe(
      'running',
    );
  });

  it('a group has faces, not theatres: the mood does not divide per member', () => {
    const { container } = render(
      <AgentAvatar
        avatar={{
          kind: 'group',
          members: [bob.avatar, bob.avatar],
        }}
        mood="running"
      />,
    );
    expect(container.querySelector('.mood-bloub')).toBeNull();
  });

  it('shows the faces of a group', () => {
    const { container } = render(
      <AgentAvatar
        avatar={{
          kind: 'group',
          members: [
            { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
            { color: '#8b5cf6', shape: 'galet', variant: 'neutral' },
          ],
        }}
      />,
    );
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(1);
  });

  it('counts the members that do not fit', () => {
    render(
      <AgentAvatar
        avatar={{
          kind: 'group',
          members: [
            { color: '#e8483f', shape: 'cercle', variant: 'neutral' },
            { color: '#8b5cf6', shape: 'galet', variant: 'neutral' },
            { color: '#4f9d8f', shape: 'squircle', variant: 'neutral' },
            { color: '#e8b44f', shape: 'capsule', variant: 'neutral' },
          ],
        }}
      />,
    );
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('shows the unread mark', () => {
    render(
      <AgentAvatar
        avatar={{ color: '#e8483f', shape: 'cercle', variant: 'neutral' }}
        unread
      />,
    );
    expect(screen.getByLabelText('Unread')).toBeTruthy();
  });

  it('hides the unread mark when there is none', () => {
    render(
      <AgentAvatar
        avatar={{ color: '#e8483f', shape: 'cercle', variant: 'neutral' }}
      />,
    );
    expect(screen.queryByLabelText('Unread')).toBeNull();
  });
});

describe('a line in a group', () => {
  it('is plain when there is nobody to name', () => {
    render(<MentionText text="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('picks the bots it names out', () => {
    const { container } = render(
      <MentionText text="hey @Bob" members={[bob]} />,
    );
    expect(container.querySelector('.mention')?.textContent).toBe('@Bob');
  });
});

describe('the logo editor', () => {
  it('shows the shapes and the colours', () => {
    render(
      <LogoEditor
        avatar={{ color: '#e8483f', shape: 'cercle', variant: 'neutral' }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Circle')).toBeTruthy();
    expect(screen.getByLabelText('Teal')).toBeTruthy();
  });

  it('changes the shape of a bot', () => {
    let shape = 'cercle';
    render(
      <>
        <ShapeGrid
          value={shape as 'cercle'}
          color="#e8483f"
          onChange={(next) => {
            shape = next;
          }}
        />
        <ColorGrid value="#e8483f" onChange={() => undefined} />
      </>,
    );
    screen.getByLabelText('Pebble').click();
    expect(shape).toBe('galet');
  });
});

describe('what a tapback opens', () => {
  it('says who reacted, and with what', () => {
    render(
      <ReactionDetails
        x={10}
        y={10}
        groups={[{ emoji: '👍', count: 2, by: ['Bob', 'Alice'] }]}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Bob et Alice ont réagi')).toBeTruthy();
    expect(screen.getByText('👍')).toBeTruthy();
  });

  it('says it when only one bot reacted', () => {
    render(
      <ReactionDetails
        x={10}
        y={10}
        groups={[{ emoji: '🔥', count: 1, by: ['Bob'] }]}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Bob a réagi')).toBeTruthy();
  });

  it('says it when nobody is named', () => {
    render(
      <ReactionDetails
        x={10}
        y={10}
        groups={[{ emoji: '🔥', count: 1, by: [] }]}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Un bot a réagi')).toBeTruthy();
  });
});

describe('the menu of a conversation', () => {
  const thread = {
    id: 'bot:bob',
    name: 'Bob',
    profile: 'bob',
    avatar: { color: '#e8483f', shape: 'cercle' as const, variant: 'neutral' as const },
    preview: '',
    time: '',
    chatTime: '',
    messages: [],
  };

  it('offers what can be done to a conversation', () => {
    render(
      <ThreadContextMenu
        thread={thread}
        x={10}
        y={10}
        canDelete
        canPin
        pinLimit={3}
        onPin={() => undefined}
        onDelete={() => undefined}
        onToggleUnread={() => undefined}
        onEdit={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Pin')).toBeTruthy();
    expect(screen.getByText('Mark as unread')).toBeTruthy();
    expect(screen.getByText('Edit bot')).toBeTruthy();
    expect(screen.getByText('Delete bot')).toBeTruthy();
  });

  it('says when a conversation cannot be pinned', () => {
    render(
      <ThreadContextMenu
        thread={thread}
        x={10}
        y={10}
        canDelete={false}
        canPin={false}
        pinLimit={3}
        onPin={() => undefined}
        onDelete={() => undefined}
        onToggleUnread={() => undefined}
        onEdit={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Pin (max 3)')).toBeTruthy();
    expect(screen.getByText('Delete bot')).toBeTruthy();
  });

  it('says when a conversation cannot be deleted', () => {
    render(
      <ThreadContextMenu
        thread={thread}
        x={10}
        y={10}
        canDelete={false}
        canPin
        pinLimit={3}
        onPin={() => undefined}
        onDelete={() => undefined}
        onToggleUnread={() => undefined}
        onEdit={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Delete bot')).toBeTruthy();
  });
});
