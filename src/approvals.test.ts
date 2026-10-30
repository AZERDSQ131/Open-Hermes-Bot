import { describe, expect, it } from 'vitest';
import {
  approvalLabel,
  isApprovalChoice,
  readApproval,
  readChoices,
  withApproval,
  withoutApproval,
  type ApprovalRequest,
} from './approvals';
import type { PendingApproval } from './data';

function held(requestId: string): PendingApproval {
  const approval: ApprovalRequest = {
    requestId,
    runId: `run-${requestId}`,
    approvalId: `req-${requestId}`,
    executionGeneration: 1,
    command: 'rm -rf build',
    description: '',
    choices: ['once', 'deny'],
  };
  return { approval, botName: 'Patch', profile: 'patch' };
}

describe('readApproval', () => {
  it('reads the event Hermes emits for a held command', () => {
    expect(
      readApproval(
        {
          event: 'approval.request',
          run_id: 'run-7',
          request_id: 'req-2',
          command: 'rm -rf build',
          description: 'The bot wants to clear the build output.',
          execution_generation: 3,
          choices: ['once', 'session', 'deny'],
        },
        'turn-1',
      ),
    ).toEqual({
      requestId: 'turn-1',
      runId: 'run-7',
      approvalId: 'req-2',
      executionGeneration: 3,
      command: 'rm -rf build',
      description: 'The bot wants to clear the build output.',
      choices: ['once', 'session', 'deny'],
    });
  });

  it('keeps no generation when the host fenced the prompt with none', () => {
    expect(
      readApproval({ run_id: 'run-1', command: 'ls' })?.executionGeneration,
    ).toBeNull();
    expect(
      readApproval({
        run_id: 'run-1',
        command: 'ls',
        execution_generation: null,
      })?.executionGeneration,
    ).toBeNull();
    expect(
      readApproval({
        run_id: 'run-1',
        command: 'ls',
        execution_generation: '2',
      })?.executionGeneration,
    ).toBeNull();
  });

  it('takes the request id from the event when the envelope has none', () => {
    const approval = readApproval({
      runId: 'run-9',
      requestId: 'turn-4',
      command: 'sudo reboot',
    });
    expect(approval?.requestId).toBe('turn-4');
    expect(approval?.approvalId).toBe('');
  });

  it('falls back to the reason when there is no description', () => {
    const approval = readApproval({
      run_id: 'run-1',
      command: 'git push --force',
      reason: 'It rewrites history.',
    });
    expect(approval?.description).toBe('It rewrites history.');
  });

  it('reads the allowed choices of a transport-shaped payload', () => {
    const approval = readApproval({
      run_id: 'run-1',
      command: 'make install',
      allowed_choices: ['once', 'always'],
    });
    expect(approval?.choices).toEqual(['once', 'always']);
  });

  it('refuses an event it could not answer', () => {
    expect(readApproval(null)).toBeNull();
    expect(readApproval('approval')).toBeNull();
    expect(readApproval({ command: 'ls' })).toBeNull();
    expect(readApproval({ run_id: 'run-1' })).toBeNull();
    expect(readApproval({ run_id: 'run-1', command: '   ' })).toBeNull();
  });
});

describe('readChoices', () => {
  it('keeps the card order whatever order the host sent', () => {
    expect(readChoices(['deny', 'always', 'once'])).toEqual([
      'once',
      'always',
      'deny',
    ]);
  });

  it('drops an answer the app does not know, and repeats', () => {
    expect(readChoices(['once', 'once', 'maybe', 'deny'])).toEqual([
      'once',
      'deny',
    ]);
  });

  it('offers once and deny when the host says nothing usable', () => {
    expect(readChoices(undefined)).toEqual(['once', 'deny']);
    expect(readChoices([])).toEqual(['once', 'deny']);
    expect(readChoices(['never'])).toEqual(['once', 'deny']);
  });
});

describe('the words of an answer', () => {
  it('names every choice the card can draw', () => {
    expect(approvalLabel('once')).toBe('Allow once');
    expect(approvalLabel('session')).toBe('For this session');
    expect(approvalLabel('always')).toBe('Always allow');
    expect(approvalLabel('deny')).toBe('Deny');
  });

  it('knows the four answers and nothing else', () => {
    expect(isApprovalChoice('once')).toBe(true);
    expect(isApprovalChoice('deny')).toBe(true);
    expect(isApprovalChoice('always')).toBe(true);
    expect(isApprovalChoice('session')).toBe(true);
    expect(isApprovalChoice('maybe')).toBe(false);
    expect(isApprovalChoice(1)).toBe(false);
  });
});

describe('the list of held commands', () => {
  it('adds one to an empty list', () => {
    const one = held('a');
    expect(withApproval(undefined, one)).toEqual([one]);
  });

  it('keeps two different commands, in the order they arrived', () => {
    const a = held('a');
    const b = held('b');
    expect(withApproval([a], b)).toEqual([a, b]);
  });

  it('replaces the same command instead of listing it twice', () => {
    const a = held('a');
    const b = held('b');
    const again = { ...a, botName: 'Nova' };
    const list = withApproval([a, b], again);
    expect(list).toHaveLength(2);
    expect(list[list.length - 1].botName).toBe('Nova');
  });

  it('drops one, and hands back the same list when it was not there', () => {
    const a = held('a');
    const b = held('b');
    expect(withoutApproval([a, b], 'a')).toEqual([b]);
    const list = [a, b];
    expect(withoutApproval(list, 'zzz')).toBe(list);
  });

  it('has nothing to drop in an empty or missing list', () => {
    expect(withoutApproval(undefined, 'a')).toBeUndefined();
    expect(withoutApproval([], 'a')).toEqual([]);
  });
});
