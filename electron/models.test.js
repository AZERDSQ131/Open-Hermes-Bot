import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { modelRef } = require('./models.js');

describe('the name of a model', () => {
  it('moves the provider out of an auto model', () => {
    expect(modelRef('auto', 'opencode-go/muse-spark')).toEqual({
      provider: 'opencode-go',
      model: 'muse-spark',
    });
  });

  it('does the same when no provider was given at all', () => {
    expect(modelRef(undefined, 'opencode-go/muse-spark')).toEqual({
      provider: 'opencode-go',
      model: 'muse-spark',
    });
    expect(modelRef('', 'xai/grok-4')).toEqual({ provider: 'xai', model: 'grok-4' });
  });

  it('reads the double colon Hermes also accepts', () => {
    expect(modelRef('auto', 'opencode-go::muse-spark')).toEqual({
      provider: 'opencode-go',
      model: 'muse-spark',
    });
  });

  it('leaves a pair the person picked exactly as it is', () => {
    expect(modelRef('opencode-go', 'muse-spark')).toEqual({
      provider: 'opencode-go',
      model: 'muse-spark',
    });
    // A slash in a model id that belongs to that provider is not a prefix.
    expect(modelRef('openrouter', 'meta-llama/llama-3')).toEqual({
      provider: 'openrouter',
      model: 'meta-llama/llama-3',
    });
  });

  it('says nothing when there is nothing to say', () => {
    expect(modelRef('auto', '')).toEqual({ provider: 'auto', model: '' });
    expect(modelRef('auto', undefined)).toEqual({ provider: 'auto', model: '' });
    expect(modelRef(undefined, 'just-a-model')).toEqual({
      provider: '',
      model: 'just-a-model',
    });
  });

  it('refuses to read a prefix out of a broken name', () => {
    expect(modelRef('auto', '/muse-spark')).toEqual({
      provider: 'auto',
      model: '/muse-spark',
    });
    expect(modelRef('auto', 'opencode-go/')).toEqual({
      provider: 'auto',
      model: 'opencode-go/',
    });
    expect(modelRef('auto', '::muse-spark')).toEqual({
      provider: 'auto',
      model: '::muse-spark',
    });
  });
});
