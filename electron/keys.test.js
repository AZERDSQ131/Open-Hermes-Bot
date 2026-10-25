import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The rules live in a CommonJS module, because the bridge that uses them runs
// in the Electron main process. The test loads it the way Node does.
const require = createRequire(import.meta.url);
const {
  MIN_KEY_LENGTH,
  adoptHostKey,
  envKey,
  hostName,
  keyOrigin,
  originMatches,
  plausibleKey,
  refusalMessage,
  stripQuotes,
} = require('./keys.js');

const KEY = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const onHost = { mode: 'ssh', sshHost: 'raspi' };

describe('the key a shell hands over', () => {
  it('is the first line that holds something', () => {
    expect(envKey('\n\n' + KEY + '\n')).toBe(KEY);
  });

  it('loses the quotes a person may have written', () => {
    expect(envKey(`"${KEY}"`)).toBe(KEY);
    expect(envKey(`'${KEY}'`)).toBe(KEY);
  });

  it('reads as nothing when nothing came back', () => {
    expect(envKey('')).toBe('');
    expect(envKey('   \n\t\n')).toBe('');
    expect(envKey(undefined)).toBe('');
  });

  it('keeps a quote that is only on one side', () => {
    expect(stripQuotes('"abc')).toBe('"abc');
    expect(stripQuotes('a')).toBe('a');
  });

  it('is plausible only at the length a Hermes key has', () => {
    expect(MIN_KEY_LENGTH).toBe(16);
    expect(plausibleKey(KEY)).toBe(true);
    expect(plausibleKey('short')).toBe(false);
    expect(plausibleKey(undefined)).toBe(false);
  });
});

describe('where a key came from', () => {
  it('is the machine whose Hermes home held it', () => {
    expect(keyOrigin(onHost)).toEqual({ mode: 'ssh', sshHost: 'raspi' });
    expect(keyOrigin({ mode: 'local', sshHost: 'ignored' })).toEqual({
      mode: 'local',
      sshHost: '',
    });
    expect(keyOrigin(undefined)).toEqual({ mode: 'ssh', sshHost: '' });
  });

  it('keeps belonging to the machine it was read from', () => {
    expect(originMatches(keyOrigin(onHost), onHost)).toBe(true);
    expect(originMatches(keyOrigin({ mode: 'local' }), { mode: 'local' })).toBe(
      true,
    );
  });

  it('stops belonging when the app talks to another machine', () => {
    const fromMac = keyOrigin({ mode: 'local' });
    expect(originMatches(fromMac, onHost)).toBe(false);
    const fromPi = keyOrigin({ mode: 'ssh', sshHost: 'raspi' });
    expect(
      originMatches(fromPi, { mode: 'ssh', sshHost: 'raspi.local' }),
    ).toBe(false);
  });

  it('is forgiving about the case of a host', () => {
    const fromPi = keyOrigin({ mode: 'ssh', sshHost: 'Raspi' });
    expect(originMatches(fromPi, onHost)).toBe(true);
  });

  it('is unknown for a key kept before origins were written down', () => {
    expect(originMatches(null, onHost)).toBe(true);
  });
});

describe('a key the host accepts is the key', () => {
  it('is adopted when the machine agrees with it', () => {
    expect(
      adoptHostKey({ stored: KEY, hostKey: OTHER, accepted: true }),
    ).toBe(OTHER);
  });

  it('is never adopted on a promise', () => {
    expect(adoptHostKey({ stored: KEY, hostKey: OTHER, accepted: false })).toBe(
      '',
    );
  });

  it('changes nothing when it is the key we already had', () => {
    expect(adoptHostKey({ stored: KEY, hostKey: KEY, accepted: true })).toBe('');
    expect(adoptHostKey({ stored: KEY, hostKey: ` ${KEY} `, accepted: true })).toBe('');
  });

  it('is refused when the read was wreckage', () => {
    expect(
      adoptHostKey({ stored: KEY, hostKey: 'short', accepted: true }),
    ).toBe('');
    expect(adoptHostKey({ stored: KEY, hostKey: '', accepted: true })).toBe('');
    expect(adoptHostKey({ stored: KEY, accepted: true })).toBe('');
  });

  it('is adopted when there was no key before it', () => {
    expect(adoptHostKey({ hostKey: OTHER, accepted: true })).toBe(OTHER);
  });
});

describe('what a refusal says', () => {
  it('names the machine, and the one thing to do', () => {
    expect(refusalMessage(onHost, { hostKeyFound: false })).toBe(
      'The key was refused by raspi. Read the key from raspi again in Settings → Connection.',
    );
  });

  it('says a host with no name plainly', () => {
    expect(hostName({ mode: 'ssh' })).toBe('the host');
    expect(hostName({ mode: 'local', sshHost: 'x' })).toBe('this Mac');
  });

  it('says where another key waits when the host has one', () => {
    expect(
      refusalMessage(onHost, { hostKeyFound: true, hostKeyDiffers: true }),
    ).toBe(
      'The key was refused by raspi. The Hermes home on raspi holds another one — read the key again.',
    );
  });

  it('does not pretend there is another key when the host has none', () => {
    expect(
      refusalMessage(onHost, { hostKeyFound: true, hostKeyDiffers: false }),
    ).toBe(
      'The key in the Hermes home on raspi was refused too. Check API_SERVER_KEY in ~/.hermes/.env.',
    );
  });

  it('speaks about this Mac when Hermes runs here', () => {
    expect(refusalMessage({ mode: 'local' }, {})).toBe(
      'The key was refused by this Mac. Read the key from this Mac again in Settings → Connection.',
    );
  });

  it('reads as a sentence even with nothing to go on', () => {
    expect(refusalMessage(undefined, undefined)).toContain('the host');
  });
});
