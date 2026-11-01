import { describe, expect, it } from 'vitest';
import {
  canAnswer,
  clarifyAnswer,
  readChoices,
  readClarify,
  withClarify,
  withoutClarify,
} from './clarify';

const event = {
  run_id: 'run_1',
  prompt_id: 'p_1',
  execution_generation: 7,
  question: 'Quel fichier dois-je ouvrir ?',
  choices: ['README.md', 'AGENTS.md'],
};

describe('a question a turn is holding on', () => {
  it('reads what the host sent', () => {
    expect(readClarify(event, 'req_1')).toEqual({
      requestId: 'req_1',
      runId: 'run_1',
      promptId: 'p_1',
      executionGeneration: 7,
      question: 'Quel fichier dois-je ouvrir ?',
      choices: ['README.md', 'AGENTS.md'],
    });
  });

  it('reads a free-text question, which offers no answer', () => {
    const free = readClarify({ run_id: 'run_1', prompt_id: 'p_1', question: 'Ton nom ?' });
    expect(free?.choices).toEqual([]);
  });

  it('refuses an event it could not draw', () => {
    expect(readClarify(null)).toBeNull();
    expect(readClarify({ run_id: 'run_1', prompt_id: 'p_1' })).toBeNull();
    expect(readClarify({ prompt_id: 'p_1', question: 'Oui ?' })).toBeNull();
    expect(readClarify({ run_id: 'run_1', question: 'Oui ?' })).toBeNull();
  });

  it('keeps a generation it cannot trust out of the answer', () => {
    const odd = readClarify({ ...event, execution_generation: 'sept' });
    expect(odd?.executionGeneration).toBeNull();
  });

  it('accepts the request_id spelling too', () => {
    const alt = readClarify({ run_id: 'run_1', request_id: 'p_9', text: 'Et alors ?' });
    expect(alt?.promptId).toBe('p_9');
    expect(alt?.question).toBe('Et alors ?');
  });
});

describe('the answers a question offers', () => {
  it('drops the empty ones and the repeats', () => {
    expect(readChoices([' oui ', '', 'oui', 'non'])).toEqual(['oui', 'non']);
  });

  it('keeps a list short enough to be a choice', () => {
    expect(readChoices(['1', '2', '3', '4', '5', '6', '7'])).toHaveLength(6);
  });

  it('offers nothing when the host sent nothing', () => {
    expect(readChoices(undefined)).toEqual([]);
    expect(readChoices('oui')).toEqual([]);
  });
});

describe('answering', () => {
  it('sends the words without the padding around them', () => {
    expect(clarifyAnswer('  README.md  ')).toBe('README.md');
  });

  it('will not send an empty answer', () => {
    expect(canAnswer('   ')).toBe(false);
    expect(canAnswer('non')).toBe(true);
  });
});

describe('the questions a thread holds', () => {
  const one = { clarify: { ...readClarify(event)! } };
  const two = { clarify: { ...readClarify(event)!, promptId: 'p_2' } };

  it('holds them in the order they arrived', () => {
    expect(withClarify(undefined, one).map((row) => row.clarify.promptId)).toEqual(['p_1']);
    expect(withClarify([one], two).map((row) => row.clarify.promptId)).toEqual(['p_1', 'p_2']);
  });

  it('replaces a question that came twice', () => {
    expect(withClarify([one], one)).toHaveLength(1);
  });

  it('drops the one the host settled, and leaves the list alone otherwise', () => {
    expect(withoutClarify([one, two], 'p_1')).toEqual([two]);
    expect(withoutClarify([one], 'p_9')).toEqual([one]);
    expect(withoutClarify([], 'p_1')).toEqual([]);
  });
});
