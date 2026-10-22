import { describe, expect, it } from 'vitest';
import {
  applyUpdateEvent,
  initialUpdateStatus,
  updateButtonBusy,
  updateButtonDisabled,
  updateButtonLabel,
  updateDetail,
  updateIsTakingOver,
} from './updates';

describe('the state of an update', () => {
  it('starts knowing nothing', () => {
    const status = initialUpdateStatus();
    expect(status.state).toBe('idle');
    expect(status.version).toBe('');
    expect(status.percent).toBe(0);
    expect(status.message).toBe('');
  });

  it('gives every caller its own state', () => {
    const first = initialUpdateStatus();
    const second = initialUpdateStatus();
    first.version = '1.1.0';
    expect(second.version).toBe('');
  });

  it('takes what the shell said', () => {
    const status = applyUpdateEvent(initialUpdateStatus(), {
      state: 'downloading',
      version: '1.1.0',
      percent: 42,
    });
    expect(status.state).toBe('downloading');
    expect(status.version).toBe('1.1.0');
    expect(status.percent).toBe(42);
  });

  it('keeps the version it knows when the shell does not say one', () => {
    const status = applyUpdateEvent(
      { ...initialUpdateStatus(), version: '1.1.0' },
      { state: 'downloading', percent: 10 },
    );
    expect(status.version).toBe('1.1.0');
    expect(status.percent).toBe(10);
  });

  it('has no message when the shell does not give one', () => {
    const status = applyUpdateEvent(
      { ...initialUpdateStatus(), message: 'old news' },
      { state: 'current', version: '1.0.0' },
    );
    expect(status.message).toBe('');
  });
});

describe('what the page says about an update', () => {
  it('says the app looks for itself', () => {
    expect(updateDetail(initialUpdateStatus())).toMatch(/releases page/);
  });

  it('says it is looking', () => {
    expect(updateDetail({ ...initialUpdateStatus(), state: 'checking' })).toMatch(
      /Looking/,
    );
  });

  it('says which version it found', () => {
    expect(
      updateDetail({
        ...initialUpdateStatus(),
        state: 'available',
        version: '1.1.0',
      }),
    ).toContain('1.1.0');
  });

  it('says how far the download has come', () => {
    expect(
      updateDetail({
        ...initialUpdateStatus(),
        state: 'downloading',
        version: '1.1.0',
        percent: 42,
      }),
    ).toContain('42%');
  });

  it('says the version is ready', () => {
    expect(
      updateDetail({
        ...initialUpdateStatus(),
        state: 'ready',
        version: '1.1.0',
      }),
    ).toContain('ready');
  });

  it('says the app is up to date', () => {
    expect(updateDetail({ ...initialUpdateStatus(), state: 'current' })).toMatch(
      /up to date/,
    );
  });

  it('says why it could not look', () => {
    expect(
      updateDetail({
        ...initialUpdateStatus(),
        state: 'error',
        message: 'no network',
      }),
    ).toBe('no network');
  });

  it('says something when the failure carries no reason', () => {
    expect(updateDetail({ ...initialUpdateStatus(), state: 'error' })).toMatch(
      /Could not/,
    );
  });

  it('says why it cannot look at all', () => {
    expect(
      updateDetail({
        ...initialUpdateStatus(),
        state: 'unsupported',
        message: 'not installed',
      }),
    ).toBe('not installed');
  });

  it('says something when there is no reason it cannot look', () => {
    expect(updateDetail({ ...initialUpdateStatus(), state: 'unsupported' })).toMatch(
      /installed app/,
    );
  });
});

describe('the button of the update', () => {
  it('asks for a check when nothing is known', () => {
    expect(updateButtonLabel(initialUpdateStatus())).toBe(
      'Check for updates',
    );
  });

  it('says it is checking', () => {
    expect(
      updateButtonLabel({ ...initialUpdateStatus(), state: 'checking' }),
    ).toBe('Checking…');
  });

  it('says how far the download has come', () => {
    expect(
      updateButtonLabel({
        ...initialUpdateStatus(),
        state: 'downloading',
        percent: 42,
      }),
    ).toBe('Downloading… 42%');
  });

  it('says the app is restarting', () => {
    expect(
      updateButtonLabel({ ...initialUpdateStatus(), state: 'ready' }),
    ).toBe('Restarting…');
  });

  it('asks again when the app is up to date', () => {
    expect(
      updateButtonLabel({ ...initialUpdateStatus(), state: 'current' }),
    ).toBe('Check again');
  });

  it('asks again when the check failed', () => {
    expect(updateButtonLabel({ ...initialUpdateStatus(), state: 'error' })).toBe(
      'Try again',
    );
  });

  it('is busy while the app is looking', () => {
    expect(
      updateButtonBusy({ ...initialUpdateStatus(), state: 'checking' }),
    ).toBe(true);
  });

  it('is busy while the app is downloading', () => {
    expect(
      updateButtonBusy({ ...initialUpdateStatus(), state: 'downloading' }),
    ).toBe(true);
  });

  it('is busy while the app is becoming the new version', () => {
    expect(updateButtonBusy({ ...initialUpdateStatus(), state: 'ready' })).toBe(
      true,
    );
  });

  it('is free when the app is up to date', () => {
    expect(updateButtonBusy({ ...initialUpdateStatus(), state: 'current' })).toBe(
      false,
    );
  });

  it('cannot be pressed while the app is busy', () => {
    expect(
      updateButtonDisabled({ ...initialUpdateStatus(), state: 'checking' }),
    ).toBe(true);
  });

  it('cannot be pressed when the app cannot look for an update', () => {
    expect(
      updateButtonDisabled({ ...initialUpdateStatus(), state: 'unsupported' }),
    ).toBe(true);
  });

  it('can be pressed when the app is up to date', () => {
    expect(
      updateButtonDisabled({ ...initialUpdateStatus(), state: 'current' }),
    ).toBe(false);
  });
});

describe('the moment the app becomes the new version', () => {
  it('is the one where the version is ready', () => {
    expect(updateIsTakingOver({ ...initialUpdateStatus(), state: 'ready' })).toBe(
      true,
    );
  });

  it('is not any other', () => {
    expect(updateIsTakingOver(initialUpdateStatus())).toBe(false);
    expect(
      updateIsTakingOver({ ...initialUpdateStatus(), state: 'downloading' }),
    ).toBe(false);
  });
});
