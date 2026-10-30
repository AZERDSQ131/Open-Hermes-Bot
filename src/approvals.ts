/**
 * A dangerous command Hermes is holding, and the answer it needs.
 *
 * The host emits `approval.request` in the middle of a turn and waits: nothing
 * moves until the person answers. This module is the rules of that card - what
 * the event means, which answers it offers, and what each one is called - kept
 * out of the window so they can be exercised without one.
 */

import type { PendingApproval } from './data';

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export type ApprovalRequest = {
  /** The turn this belongs to: how the card finds its conversation. */
  requestId: string;
  /** The run Hermes is holding; the answer is posted against it. */
  runId: string;
  /** The single request inside that run, empty when the host sent none. */
  approvalId: string;
  /**
   * The generation the host fenced the prompt with. The authority path wants
   * it back exactly, or it answers `stale_generation`; null when absent.
   */
  executionGeneration: number | null;
  command: string;
  description: string;
  choices: ApprovalChoice[];
};

/** The order the card draws the answers in, whatever order the host sent. */
const CHOICES: ApprovalChoice[] = ['once', 'session', 'always', 'deny'];

const LABELS: Record<ApprovalChoice, string> = {
  once: 'Allow once',
  session: 'For this session',
  always: 'Always allow',
  deny: 'Deny',
};

export function isApprovalChoice(value: unknown): value is ApprovalChoice {
  return (
    typeof value === 'string' && (CHOICES as string[]).includes(value)
  );
}

/** The answers the host offered, in the card's order, with no duplicates. */
export function readChoices(raw: unknown): ApprovalChoice[] {
  const offered = Array.isArray(raw) ? raw.filter(isApprovalChoice) : [];
  const kept = CHOICES.filter((choice) => offered.includes(choice));
  // A host that names no answer still gets a usable card: once, or no.
  return kept.length ? kept : ['once', 'deny'];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * What an `approval.request` event means, or null when it cannot be answered.
 *
 * `requestId` is the turn the event arrived on; the event's own `request_id`
 * is the approval inside that turn, and is what a correlated answer carries.
 */
export function readApproval(
  raw: unknown,
  requestId = '',
): ApprovalRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  const runId = text(event.run_id) || text(event.runId);
  const command = text(event.command);
  if (!runId || !command) return null;
  const rawGeneration = event.execution_generation;
  const executionGeneration =
    typeof rawGeneration === 'number' && Number.isInteger(rawGeneration)
      ? rawGeneration
      : null;
  return {
    requestId: text(event.requestId) || requestId,
    runId,
    approvalId: text(event.request_id),
    executionGeneration,
    command,
    description: text(event.description) || text(event.reason),
    choices: readChoices(event.choices ?? event.allowed_choices),
  };
}

export function approvalLabel(choice: ApprovalChoice): string {
  return LABELS[choice];
}

/** Put a held command in the list, replacing any earlier frame of the same one. */
export function withApproval(
  list: PendingApproval[] | undefined,
  entry: PendingApproval,
): PendingApproval[] {
  const rest = (list ?? []).filter(
    (row) => row.approval.requestId !== entry.approval.requestId,
  );
  return [...rest, entry];
}

/** Drop one held command; the same list when it was not there. */
export function withoutApproval(
  list: PendingApproval[] | undefined,
  requestId: string,
): PendingApproval[] | undefined {
  if (!list?.length) return list;
  const rest = list.filter((row) => row.approval.requestId !== requestId);
  return rest.length === list.length ? list : rest;
}
