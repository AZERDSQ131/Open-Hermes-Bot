import { describe, expect, it } from 'vitest';
import { EFFORT_CHOICES, effortIndex, reasoningFor } from './effort';

describe('choosing how hard the model thinks', () => {
  it('falls back to Auto on a choice it does not know', () => {
    expect(effortIndex('turbo')).toBe(0);
  });

  it('offers three choices, the default first', () => {
    expect(EFFORT_CHOICES.map((choice) => choice.id)).toEqual(['auto', 'off', 'deep']);
  });

  it('knows where each choice sits, so the highlight can slide to it', () => {
    expect(effortIndex()).toBe(0);
    expect(effortIndex('off')).toBe(1);
    expect(effortIndex('deep')).toBe(2);
  });

  it('sends nothing when the person left it to the model', () => {
    expect(reasoningFor()).toBeUndefined();
    expect(reasoningFor('auto')).toBeUndefined();
    expect(reasoningFor('turbo')).toBeUndefined();
  });

  it('turns Off into no thinking at all', () => {
    expect(reasoningFor('off')).toEqual({ enabled: false });
  });

  it('asks for a deep effort the host understands', () => {
    expect(reasoningFor('deep')).toEqual({ effort: 'high' });
  });
});
