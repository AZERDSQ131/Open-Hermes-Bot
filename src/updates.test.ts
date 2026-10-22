import { describe, expect, it } from 'vitest';
import {
  applyUpdateEvent,
  initialUpdateStatus,
  releaseDateWords,
  releaseRows,
  updateBadge,
  updateButtonBusy,
  updateButtonDisabled,
  updateButtonLabel,
  updateDetail,
  updateIsTakingOver,
  updateMarkWords,
  updateProgress,
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

describe('the date the release came out', () => {
  it('travels with the version when Github said it', () => {
    const status = applyUpdateEvent(initialUpdateStatus(), {
      state: 'available',
      version: '1.0.1',
      released: '2025-10-20T12:00:00Z',
    });
    expect(status.released).toBe('2025-10-20T12:00:00Z');
  });

  it('stays what it was of old, when nothing says it', () => {
    const before = applyUpdateEvent(initialUpdateStatus(), {
      state: 'available',
      version: '1.0.1',
      released: '2025-10-20T12:00:00Z',
    });
    expect(applyUpdateEvent(before, { state: 'downloading' }).released).toBe(
      '2025-10-20T12:00:00Z',
    );
  });

  it('says the day in the words people read', () => {
    expect(releaseDateWords('2025-10-22T12:00:00Z')).toBe('Oct 22');
  });

  it('says nothing when there is no date to say', () => {
    expect(releaseDateWords('')).toBe('');
  });

  it('says nothing when the date is not a date', () => {
    expect(releaseDateWords('the day after tomorrow')).toBe('');
  });
});

describe('the little mark beside the settings', () => {
  it('shows nothing while nothing is known', () => {
    expect(updateBadge(initialUpdateStatus())).toBe('none');
    expect(updateBadge({ ...initialUpdateStatus(), state: 'current' })).toBe(
      'none',
    );
    expect(
      updateBadge({ ...initialUpdateStatus(), state: 'unsupported' }),
    ).toBe('none');
  });

  it('is busy while version are looked for or carried in', () => {
    expect(updateBadge({ ...initialUpdateStatus(), state: 'checking' })).toBe(
      'busy',
    );
    expect(updateBadge({ ...initialUpdateStatus(), state: 'downloading' })).toBe(
      'busy',
    );
  });

  it('tells it quietly when a version was seen', () => {
    expect(updateBadge({ ...initialUpdateStatus(), state: 'available' })).toBe(
      'coming',
    );
  });

  it('tells it loud when the version is on the disk', () => {
    expect(updateBadge({ ...initialUpdateStatus(), state: 'ready' })).toBe(
      'here',
    );
  });

  it('says something went amiss, without shouting', () => {
    expect(updateBadge({ ...initialUpdateStatus(), state: 'error' })).toBe(
      'trouble',
    );
  });

  it('follows the download as it goes, and only then', () => {
    expect(
      updateProgress({
        ...initialUpdateStatus(),
        state: 'downloading',
        percent: 42,
      }),
    ).toBe(42);
    expect(updateProgress(initialUpdateStatus())).toBe(null);
  });
});

describe('the words the small place says', () => {
  it('says nothing yet, and what it is doing now', () => {
    expect(updateMarkWords(initialUpdateStatus())).toBe('Check for an update');
    expect(updateMarkWords({ ...initialUpdateStatus(), state: 'checking' })).toBe(
      'Looking for an update…',
    );
  });

  it('says when a version was seen or is being carried in', () => {
    expect(updateMarkWords({ ...initialUpdateStatus(), state: 'available' })).toBe(
      'An update was found',
    );
    expect(
      updateMarkWords({
        ...initialUpdateStatus(),
        state: 'downloading',
        percent: 42,
      }),
    ).toBe('Downloading the update — 42%');
  });

  it('says when the new version is on the disk', () => {
    expect(updateMarkWords({ ...initialUpdateStatus(), state: 'ready' })).toBe(
      'The update is ready: the app restarts by itself',
    );
  });

  it('says when there is nothing to ask for', () => {
    expect(updateMarkWords({ ...initialUpdateStatus(), state: 'current' })).toBe(
      'The app is up to date',
    );
    expect(
      updateMarkWords({ ...initialUpdateStatus(), state: 'unsupported' }),
    ).toBe('The app as it runs from the sources cannot look for an update');
  });

  it('says when the look went wrong', () => {
    expect(updateMarkWords({ ...initialUpdateStatus(), state: 'error' })).toBe(
      'The look for an update failed',
    );
  });
});

describe('what Github published, row by row', () => {
  const note = (extra: Record<string, unknown> = {}) => ({
    tag_name: 'v1.0.1',
    name: 'The one that takes care of itself',
    published_at: '2025-10-20T12:00:00Z',
    prerelease: false,
    draft: false,
    html_url: 'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.0.1',
    ...extra,
  });

  it('reads the rows of the page, newest first as it came', () => {
    const rows = releaseRows([note(), note({ tag_name: 'v1.0.0', draft: true })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      tag: 'v1.0.1',
      name: 'The one that takes care of itself',
      date: '2025-10-20T12:00:00Z',
      prerelease: false,
      url: 'https://github.com/AZERDSQ131/Open-Hermes-Bot/releases/tag/v1.0.1',
    });
  });

  it('takes nothing when the page says nothing', () => {
    expect(releaseRows(null)).toEqual([]);
    expect(releaseRows('not a list')).toEqual([]);
    expect(releaseRows([])).toEqual([]);
  });

  it('walks past what is not on the page yet, or is not a release', () => {
    const rows = releaseRows([
      null,
      note({ tag_name: '', name: 'no version to name' }),
      note({ draft: true }),
    ]);
    expect(rows).toEqual([]);
  });

  it('says one when the word of its kind is there', () => {
    expect(releaseRows([note({ prerelease: true })])[0].prerelease).toBe(true);
  });

  it('names it after its version when it has no name of its own', () => {
    const rows = releaseRows([note({ name: null })]);
    expect(rows[0].name).toBe('v1.0.1');
  });

  it('leaves empty what Github did not say', () => {
    const rows = releaseRows([
      note({ name: null, published_at: null, html_url: null }),
    ]);
    expect(rows[0].name).toBe('v1.0.1');
    expect(rows[0].date).toBe('');
    expect(rows[0].url).toBe('');
    expect(rows[0].prerelease).toBe(false);
  });

  it('keeps ten rows at the most', () => {
    const rows = releaseRows(
      Array.from({ length: 23 }, (_, which) =>
        note({ tag_name: `v2.0.${which}` }),
      ),
    );
    expect(rows).toHaveLength(10);
    expect(rows[0].tag).toBe('v2.0.0');
  });
});
