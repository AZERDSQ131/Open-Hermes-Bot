import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The rule lives in a CommonJS module, because the bridge that asks it runs in
// the Electron main process. The test loads it the way Node does.
const require = createRequire(import.meta.url);
const { notificationBody, shouldAnnounce } = require('./notify.js');

const front = { supported: true, focused: true, minimized: false };
const away = { supported: true, focused: false, minimized: false };

describe('whether a finished turn is announced', () => {
  it('says nothing when the window is in front: the answer is on screen', () => {
    expect(shouldAnnounce({ ok: true, text: 'All done.' }, front)).toBe(false);
  });

  it('speaks when the window is behind another app', () => {
    expect(shouldAnnounce({ ok: true, text: 'All done.' }, away)).toBe(true);
  });

  it('speaks for a window that is minimised, even though it has the focus', () => {
    expect(
      shouldAnnounce({ ok: true, text: 'All done.' }, { ...front, minimized: true }),
    ).toBe(true);
  });

  it('stays quiet for a turn that failed, and for one that said nothing', () => {
    expect(shouldAnnounce({ ok: false, error: 'No API key' }, away)).toBe(false);
    expect(shouldAnnounce({ ok: true, text: '   ' }, away)).toBe(false);
    expect(shouldAnnounce({ ok: true }, away)).toBe(false);
    expect(shouldAnnounce(null, away)).toBe(false);
  });

  it('stays quiet where the system takes no notifications', () => {
    expect(shouldAnnounce({ ok: true, text: 'All done.' }, { ...away, supported: false })).toBe(
      false,
    );
    expect(shouldAnnounce({ ok: true, text: 'All done.' }, undefined)).toBe(false);
  });
});

describe('the line a notification shows', () => {
  it('keeps a short answer as it is', () => {
    expect(notificationBody('Built in 4s.')).toBe('Built in 4s.');
  });

  it('puts a long one on one line, and cuts it with an ellipsis of dots', () => {
    const body = notificationBody(`first line\n\nsecond   line ${'x'.repeat(400)}`);
    expect(body).toContain('first line second line');
    expect(body).not.toContain('\n');
    expect(body).toHaveLength(160);
    expect(body.endsWith('...')).toBe(true);
  });

  it('has nothing to show for nothing', () => {
    expect(notificationBody(undefined)).toBe('');
    expect(notificationBody('   \n ')).toBe('');
  });
});
