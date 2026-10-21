import { describe, expect, it } from 'vitest';
import { avatarColor, PRIMARY_AVATAR_COLOR, profileColor } from './profileColor';

describe('the colour a bot wears', () => {
  it('is the one Hermes derives from its name', () => {
    const color = profileColor('bob');
    expect(color).toMatch(/^hsl\(\d+ 68% 58%\)$/);
  });

  it('is the same for the same name, every time', () => {
    expect(profileColor('bob')).toBe(profileColor('bob'));
  });

  it('is not the same for two names', () => {
    expect(profileColor('bob')).not.toBe(profileColor('alice'));
  });

  it('has no colour for the primary profile', () => {
    expect(profileColor('default')).toBeNull();
    expect(profileColor('')).toBeNull();
    expect(profileColor(null)).toBeNull();
    expect(profileColor(undefined)).toBeNull();
  });

  it('is the stored one when the profile carries it', () => {
    expect(avatarColor('#e8483f', 'bob')).toBe('#e8483f');
  });

  it("is the name's own when the profile carries none", () => {
    expect(avatarColor('', 'bob')).toBe(profileColor('bob'));
  });

  it('is the friendly violet when there is nothing else', () => {
    expect(avatarColor('', 'default')).toBe(PRIMARY_AVATAR_COLOR);
    expect(avatarColor(null, null)).toBe(PRIMARY_AVATAR_COLOR);
  });
});
