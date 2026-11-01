/**
 * A question Hermes is holding a turn on.
 *
 * The host emits `clarify.request` in the middle of a turn and waits: nothing
 * moves until the person answers. It is the same shape as an approval, with a
 * question instead of a command, so the card can reuse the place in the window
 * the approval card already takes.
 *
 * This module is the rules of that card - what the event means, which answers
 * it offers - kept out of the window so they can be exercised without one.
 */

export type ClarifyRequest = {
  /** The turn this belongs to: how the card finds its conversation. */
  requestId: string;
  /** The run Hermes is holding; the answer is posted against it. */
  runId: string;
  /** The single prompt inside that run. */
  promptId: string;
  /**
   * The generation the host fenced the prompt with. The authority path wants
   * it back exactly, or it answers `stale_generation`; null when absent.
   */
  executionGeneration: number | null;
  question: string;
  /** Answers the host put on the table; empty when it asks for free text. */
  choices: string[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The answers the host offered, as written, without the empty ones and without
 * repeats. A question never offers a hundred: a list that long is a message,
 * not a choice.
 */
export function readChoices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const kept: string[] = [];
  for (const entry of raw) {
    const value = text(entry);
    if (!value || kept.includes(value)) continue;
    kept.push(value);
    if (kept.length === 6) break;
  }
  return kept;
}

/**
 * What a `clarify.request` event means, or null when it cannot be answered:
 * without a run, a prompt or a question there is nothing to put on a card.
 */
export function readClarify(raw: unknown, requestId = ''): ClarifyRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  const runId = text(event.run_id) || text(event.runId);
  const promptId = text(event.prompt_id) || text(event.request_id);
  const question = text(event.question) || text(event.text);
  if (!runId || !promptId || !question) return null;
  const rawGeneration = event.execution_generation;
  const executionGeneration =
    typeof rawGeneration === 'number' && Number.isInteger(rawGeneration)
      ? rawGeneration
      : null;
  return {
    requestId: text(event.requestId) || requestId,
    runId,
    promptId,
    executionGeneration,
    question,
    choices: readChoices(event.choices),
  };
}

/** The answer as it is posted: the words, without the padding around them. */
export function clarifyAnswer(value: string): string {
  return value.trim();
}

/** What the card needs answered before it can send. */
export function canAnswer(value: string): boolean {
  return clarifyAnswer(value).length > 0;
}

/** Add or replace the held question of the same prompt. */
export function withClarify<T extends { clarify: ClarifyRequest }>(
  list: T[] | undefined,
  entry: T,
): T[] {
  const rest = (list ?? []).filter(
    (row) => row.clarify.promptId !== entry.clarify.promptId,
  );
  return [...rest, entry];
}

/** Drop one settled question; the same list when it was not there. */
export function withoutClarify<T extends { clarify: ClarifyRequest }>(
  list: T[] | undefined,
  promptId: string,
): T[] | undefined {
  if (!list?.length) return list;
  const rest = list.filter((row) => row.clarify.promptId !== promptId);
  return rest.length === list.length ? list : rest;
}
