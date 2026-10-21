import { describe, expect, it, vi } from 'vitest';
import {
  attachGroupReaction,
  attachReaction,
  isInstallingDependencies,
  isQuotaFailure,
  retryWhileDependenciesInstall,
} from './turns';
import type { Message } from './data';

const line = (text: string, id = '1'): Message => ({
  id,
  role: 'assistant',
  text,
});

describe('a model that is out of quota', () => {
  it('says so', () => {
    expect(isQuotaFailure('usage limit reached')).toBe(true);
    expect(isQuotaFailure('429 Too Many Requests')).toBe(true);
    expect(isQuotaFailure('quota exceeded')).toBe(true);
  });

  it('is not every failure', () => {
    expect(isQuotaFailure('the key was refused')).toBe(false);
    expect(isQuotaFailure(undefined)).toBe(false);
  });
});

describe('a server that is still installing', () => {
  it('says so', () => {
    expect(isInstallingDependencies('installing dependencies')).toBe(true);
    expect(isInstallingDependencies('hermes pm install running')).toBe(true);
    expect(isInstallingDependencies('the key was refused')).toBe(false);
  });
});

describe('a turn that has to wait for an install', () => {
  it('is asked again', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'installing dependencies' })
      .mockResolvedValueOnce({ ok: true, text: 'there' });
    const wait = vi.fn(async () => undefined);
    const result = await retryWhileDependenciesInstall(call, () => true, wait);
    expect(result.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('is given up on when the install does not finish', async () => {
    const call = vi.fn(async () => ({
      ok: false,
      error: 'installing dependencies',
    }));
    const wait = vi.fn(async () => undefined);
    const result = await retryWhileDependenciesInstall(call, () => true, wait);
    expect(result.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('is not asked again when the turn no longer matters', async () => {
    const call = vi.fn(async () => ({
      ok: false,
      error: 'installing dependencies',
    }));
    const wait = vi.fn(async () => undefined);
    await retryWhileDependenciesInstall(call, () => false, wait);
    expect(call).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('is not asked again when the wait is over', async () => {
    const call = vi.fn(async () => ({
      ok: false,
      error: 'installing dependencies',
    }));
    const wait = vi.fn(async () => undefined);
    let wanted = true;
    await retryWhileDependenciesInstall(
      call,
      () => {
        const answer = wanted;
        wanted = false;
        return answer;
      },
      wait,
    );
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('is not retried when the failure is another one', async () => {
    const call = vi.fn(async () => ({
      ok: false,
      error: 'the key was refused',
    }));
    await retryWhileDependenciesInstall(call, () => true, async () => undefined);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('is not retried when the turn worked', async () => {
    const call = vi.fn(async () => ({ ok: true, text: 'there' }));
    await retryWhileDependenciesInstall(call, () => true, async () => undefined);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('is not retried when the turn was cancelled', async () => {
    const call = vi.fn(async () => ({
      ok: false,
      canceled: true,
      error: 'installing dependencies',
    }));
    await retryWhileDependenciesInstall(call, () => true, async () => undefined);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('a tapback on a private conversation', () => {
  it('lands on the message the bot was answering', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'assistant', text: 'Hi' },
    ];
    const withReaction = attachReaction(messages, '👍');
    expect((withReaction[0] as { reaction?: string }).reaction).toBe('👍');
    expect((withReaction[1] as { reaction?: string }).reaction).toBeUndefined();
  });

  it('lands on nothing when there is no message to tap', () => {
    const messages: Message[] = [line('A line the bot wrote')];
    expect(attachReaction(messages, '👍')).toBe(messages);
  });

  it('does nothing without an emoji', () => {
    const messages: Message[] = [{ id: '1', role: 'user', text: 'Hello' }];
    expect(attachReaction(messages)).toBe(messages);
  });
});

describe('a tapback in a group', () => {
  it('lands on the last line the reactor did not write', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'assistant', text: 'Hi', authorId: 'a', authorName: 'Bob' },
    ];
    const withReaction = attachGroupReaction(messages, '👍', 'Alice');
    // The last line is Bob's, and Alice did not write it: it is hers.
    expect(
      (withReaction[1] as { reactions?: unknown[] }).reactions,
    ).toHaveLength(1);
    expect(
      (withReaction[0] as { reactions?: unknown[] }).reactions,
    ).toBeUndefined();
  });

  it('is signed, so two bots can tap the same message', () => {
    const messages: Message[] = [{ id: '1', role: 'user', text: 'Hello' }];
    const first = attachGroupReaction(messages, '👍', 'Alice');
    const second = attachGroupReaction(first, '🔥', 'Bob');
    expect((second[0] as { reactions?: unknown[] }).reactions).toHaveLength(2);
  });

  it('replaces the tapback of the same bot', () => {
    const messages: Message[] = [{ id: '1', role: 'user', text: 'Hello' }];
    const first = attachGroupReaction(messages, '👍', 'Alice');
    const second = attachGroupReaction(first, '🔥', 'Alice');
    expect((second[0] as { reactions?: unknown[] }).reactions).toHaveLength(1);
  });

  it('skips the lines the reactor wrote', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'assistant', text: 'Hi', authorId: 'a', authorName: 'Bob' },
    ];
    const withReaction = attachGroupReaction(messages, '👍', 'Bob');
    expect(
      (withReaction[0] as { reactions?: unknown[] }).reactions,
    ).toHaveLength(1);
  });

  it('skips the notes', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'Hello' },
      { id: '2', role: 'event', text: 'Bob stayed silent.' },
    ];
    const withReaction = attachGroupReaction(messages, '👍', 'Alice');
    expect((withReaction[0] as { reactions?: unknown[] }).reactions).toHaveLength(
      1,
    );
  });

  it('does nothing without an emoji', () => {
    const messages: Message[] = [{ id: '1', role: 'user', text: 'Hello' }];
    expect(attachGroupReaction(messages, undefined, 'Alice')).toBe(messages);
  });

  it('does nothing when there is nothing to tap', () => {
    const messages: Message[] = [{ id: '1', role: 'event', text: 'A note' }];
    expect(attachGroupReaction(messages, '👍', 'Alice')).toBe(messages);
  });
});

describe('waiting for the install', () => {
  it('waits on its own when nothing else is said', async () => {
    vi.useFakeTimers();
    try {
      const call = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'installing dependencies' })
        .mockResolvedValueOnce({ ok: true, text: 'there' });
      const pending = retryWhileDependenciesInstall(call, () => true);
      await vi.advanceTimersByTimeAsync(9000);
      const result = await pending;
      expect(result.ok).toBe(true);
      expect(call).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
