import { describe, expect, it } from 'vitest';
import { dictationErrorText } from './dictation';

describe('what the microphone says when it cannot be used', () => {
  it('names the permission when the microphone is refused', () => {
    expect(dictationErrorText('not-allowed')).toContain('permission');
    expect(dictationErrorText('service-not-allowed')).toContain('permission');
  });

  it('names the microphone when there is none', () => {
    expect(dictationErrorText('audio-capture')).toContain('microphone');
  });

  it('names the network when the speech service cannot be reached', () => {
    expect(dictationErrorText('network')).toContain('network');
  });

  it('says what happened for anything else', () => {
    expect(dictationErrorText('boom')).toContain('boom');
  });
});
