import { describe, expect, it } from 'vitest';
import { findMatches, splitMatch, stepFind } from './find';

const conversation = [
  { id: 'a', role: 'user', text: 'Pourquoi le ciel est bleu ?' },
  { id: 'event', role: 'event', text: 'The bot could not answer this one.' },
  { id: 'b', role: 'assistant', text: 'Le ciel est bleu parce que la lumiere bleue est diffusee.' },
  { id: 'c', role: 'assistant', text: 'Une autre reponse sans le mot.' },
];

describe('looking for a word in the conversation', () => {
  it('finds every message that holds it, in order', () => {
    expect(findMatches(conversation, 'bleu')).toEqual(['a', 'b']);
  });

  it('does not care about case', () => {
    expect(findMatches(conversation, 'BLEU')).toEqual(['a', 'b']);
  });

  it('ignores the padding around the query', () => {
    expect(findMatches(conversation, '  bleu  ')).toEqual(['a', 'b']);
  });

  it('never searches a note about the turn', () => {
    expect(findMatches(conversation, 'could not answer')).toEqual([]);
  });

  it('finds nothing for an empty query', () => {
    expect(findMatches(conversation, '   ')).toEqual([]);
    expect(findMatches(conversation, '')).toEqual([]);
  });
});

describe('walking the matches', () => {
  it('goes forward and wraps at the end', () => {
    expect(stepFind(0, 3, 1)).toBe(1);
    expect(stepFind(2, 3, 1)).toBe(0);
  });

  it('goes back and wraps at the start', () => {
    expect(stepFind(0, 3, -1)).toBe(2);
    expect(stepFind(1, 3, -1)).toBe(0);
  });

  it('stays put when there is nothing to walk', () => {
    expect(stepFind(0, 0, 1)).toBe(0);
  });
});

describe('marking what matched', () => {
  it('cuts the line into plain runs and hits', () => {
    expect(splitMatch('le ciel est bleu', 'bleu')).toEqual([
      { text: 'le ciel est ', hit: false },
      { text: 'bleu', hit: true },
    ]);
  });

  it('marks every occurrence', () => {
    expect(splitMatch('bleu, encore bleu', 'bleu')).toEqual([
      { text: 'bleu', hit: true },
      { text: ', encore ', hit: false },
      { text: 'bleu', hit: true },
    ]);
  });

  it('keeps the line unchanged when the pieces are joined back', () => {
    const text = 'Un ciel bleu, un autre bleu plus clair.';
    expect(
      splitMatch(text, 'bleu')
        .map((piece) => piece.text)
        .join(''),
    ).toBe(text);
  });

  it('gives the whole line back when there is no query', () => {
    expect(splitMatch('le ciel', '  ')).toEqual([{ text: 'le ciel', hit: false }]);
  });
});
