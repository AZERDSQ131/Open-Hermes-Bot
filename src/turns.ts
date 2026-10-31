// The rules of a turn: what a tapback lands on, what happens when the model
// is out of quota, and what to do when the server is still installing.

import type { Message } from './data';

/** A model that said "not for you" because the quota is spent. */
const QUOTA_ERROR = /usage limit|quota|rate limit|too many requests|429|exhausted/i;

/** A server that is still installing what it needs. */
const DEPENDENCY_BUSY = /installing dependencies|hermes pm install/i;
const DEPENDENCY_RETRY_MS = 8000;
const DEPENDENCY_RETRIES = 2;

export type ChatOutcome = { ok: boolean; error?: string; canceled?: boolean };

/**
 * How long a turn has been running, in words a person reads at a glance. A
 * turn that waits on a tool for ten minutes must not look like a dead app.
 */
export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The tool a turn is using, in words a person reads without a manual.
 * `process_manage` is what the bot calls a background command; saying the
 * internal name is accurate and useless.
 */
const TOOL_WORDS: Record<string, string> = {
  terminal: 'the terminal',
  process_manage: 'a background command',
  execute_code: 'code',
  read_file: 'files',
  write_file: 'files',
  patch: 'files',
  search_files: 'files',
  web_search: 'the web',
  web_extract: 'the web',
  browser_exec: 'the browser',
  vision_analyze: 'an image',
};

export function toolWords(tool: string): string {
  return TOOL_WORDS[tool] ?? tool;
}

/** Is the model out of quota? */
export function isQuotaFailure(message?: string): boolean {
  return Boolean(message && QUOTA_ERROR.test(message));
}

/** Is the server still installing what it needs? */
export function isInstallingDependencies(message?: string): boolean {
  return Boolean(message && DEPENDENCY_BUSY.test(message));
}

/**
 * A profile whose environment is being provisioned refuses turns until the
 * install finishes. That is a "come back in a moment", not a dead end — the
 * group especially tends to hit it on the first parallel turn of several bots.
 */
export async function retryWhileDependenciesInstall<T extends ChatOutcome>(
  call: () => Promise<T>,
  stillWanted: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let result = await call();
  for (let attempt = 0; attempt < DEPENDENCY_RETRIES; attempt += 1) {
    if (result.ok || result.canceled) return result;
    if (!isInstallingDependencies(result.error)) return result;
    if (!stillWanted()) return result;
    await wait(DEPENDENCY_RETRY_MS);
    if (!stillWanted()) return result;
    result = await call();
  }
  return result;
}

/** A tapback belongs on the user's latest message: the one the bot was answering. */
export function attachReaction(
  messages: Message[],
  emoji?: string,
): Message[] {
  if (!emoji) return messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'user') continue;
    return messages.map((message, at) =>
      at === index ? { ...message, reaction: emoji } : message,
    );
  }
  return messages;
}

/**
 * A turn that stopped before the end still answered: the answer stands, and
 * the line under it says why. The line is an event, not the bot's voice — it
 * belongs to the conversation, and nothing sends it back to Hermes.
 */
export function withTurnNote(
  messages: Message[],
  note: string,
  id: string,
): Message[] {
  const text = note.trim();
  if (!text) return messages;
  return [...messages, { id, role: 'event', text }];
}

/**
 * In a group, a tapback lands on the last line the reactor did not write, and
 * is signed: two bots can react to the same message without overwriting one
 * another. Reacting to your own line would be talking to yourself.
 */
export function attachGroupReaction(
  messages: Message[],
  emoji: string | undefined,
  by: string,
): Message[] {
  if (!emoji) return messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const target = messages[index];
    if (target.role === 'event') continue;
    if (target.role === 'assistant' && target.authorName === by) continue;
    return messages.map((message, at) => {
      if (at !== index || message.role === 'event') return message;
      const others = (message.reactions ?? []).filter(
        (reaction) => reaction.by !== by,
      );
      return {
        ...message,
        reactions: [...others, { emoji, by }],
      };
    });
  }
  return messages;
}
