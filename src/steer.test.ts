import { describe, expect, it } from 'vitest';
import { joinsRunningTurn, STEERED_NOTE } from './steer';

describe('a message typed while a turn runs', () => {
  it('joins the running turn instead of killing it', () => {
    expect(joinsRunningTurn({ busy: true, text: 'et le fichier ?', attachments: 0 })).toBe(
      true,
    );
  });

  it('starts a new turn when nothing is running', () => {
    expect(joinsRunningTurn({ busy: false, text: 'salut', attachments: 0 })).toBe(false);
  });

  it('starts a new turn when there is nothing to say', () => {
    expect(joinsRunningTurn({ busy: true, text: '   ', attachments: 0 })).toBe(false);
  });

  it('never carries a file into a running turn', () => {
    expect(joinsRunningTurn({ busy: true, text: 'regarde', attachments: 1 })).toBe(false);
  });

  it('says where the line went', () => {
    expect(STEERED_NOTE).toBe('Added to the turn in progress');
  });
});
