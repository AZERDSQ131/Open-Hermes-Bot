import { describe, expect, it } from 'vitest';
import { COPIED_LABEL, COPY_LABEL, COPY_WORD, copyableText } from './copy';

describe('copying a line of the transcript', () => {
  it('gives the words of a message the person wrote', () => {
    expect(copyableText({ role: 'user', text: 'salut' })).toBe('salut');
  });

  it('gives the words of an answer', () => {
    expect(copyableText({ role: 'assistant', text: 'Bonjour.' })).toBe('Bonjour.');
  });

  it('keeps the line as it reads, without the padding around it', () => {
    expect(copyableText({ role: 'assistant', text: '  deux espaces  ' })).toBe(
      'deux espaces',
    );
  });

  it('does not offer a note about the turn', () => {
    expect(copyableText({ role: 'event', text: 'The bot could not answer.' })).toBe('');
  });

  it('does not offer an empty line', () => {
    expect(copyableText({ role: 'assistant', text: '   ' })).toBe('');
  });

  it('says what the button does, and what it did', () => {
    expect(COPY_LABEL).toBe('Copy message');
    expect(COPY_WORD).toBe('Copy');
    expect(COPIED_LABEL).toBe('Copied');
  });
});
