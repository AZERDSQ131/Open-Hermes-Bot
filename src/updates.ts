// What the app knows about its own next version.
//
// The main process does the looking, the downloading and the taking over.
// This file says what that means to the person reading the screen. It is
// kept apart from the interface on purpose: the states and the words are
// rules, and rules are covered to the line.

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'current'
  | 'error'
  | 'unsupported';

export type UpdateEvent = {
  state: UpdateState;
  /** The version that was found, or the one the app is running. */
  version?: string;
  /** How much of the download is on the disk, out of a hundred. */
  percent?: number;
  /** When the version that was found was published, as Github said it. */
  released?: string;
  /** Why it went wrong, when it did. */
  message?: string;
};

export type UpdateStatus = {
  state: UpdateState;
  /** The version that was found, or the one the app is running. */
  version: string;
  /** How much of the download is on the disk, out of a hundred. */
  percent: number;
  /** When the version that was found was published, as Github said it. */
  released: string;
  /** Why it went wrong, when it did. */
  message: string;
};

/** Nothing is known yet: the app has not been asked anything. */
export function initialUpdateStatus(): UpdateStatus {
  return { state: 'idle', version: '', percent: 0, released: '', message: '' };
}

/**
 * Folds what the main process said into what the screen shows.
 *
 * The main process is the authority: it looked, it downloaded, it knows. The
 * screen only reads.
 */
export function applyUpdateEvent(
  status: UpdateStatus,
  event: UpdateEvent,
): UpdateStatus {
  return {
    state: event.state,
    version: event.version ?? status.version,
    percent: event.percent ?? status.percent,
    released: event.released ?? status.released,
    message: event.message ?? '',
  };
}

/** The line that says what is happening, in the words of the app. */
export function updateDetail(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Hermes Bot finds its next version on the releases page.';
    case 'checking':
      return 'Looking for a newer version…';
    case 'available':
      return `Version ${status.version} is on the releases page.`;
    case 'downloading':
      return `Downloading ${status.version} — ${status.percent}%.`;
    case 'ready':
      return `Version ${status.version} is ready.`;
    case 'current':
      return 'Hermes Bot is up to date.';
    case 'unsupported':
      return (
        status.message ||
        'Updates are found by the installed app, not by a copy running from the sources.'
      );
    case 'error':
      return status.message || 'Could not look for an update.';
  }
}

/** What the button says. */
export function updateButtonLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Checking…';
    case 'downloading':
      return `Downloading… ${status.percent}%`;
    case 'ready':
      return 'Restarting…';
    case 'current':
      return 'Check again';
    case 'error':
      return 'Try again';
    default:
      return 'Check for updates';
  }
}

/**
 * The button is busy while the app is doing something to itself: looking,
 * downloading, or leaving to become the next version.
 */
export function updateButtonBusy(status: UpdateStatus): boolean {
  return (
    status.state === 'checking' ||
    status.state === 'downloading' ||
    status.state === 'ready'
  );
}

/**
 * The button cannot be pressed when the app has no way of finding its next
 * version: a copy running from the sources has no releases page of its own.
 */
export function updateButtonDisabled(status: UpdateStatus): boolean {
  return updateButtonBusy(status) || status.state === 'unsupported';
}

/** The new version is on the disk and the app is about to become it. */
export function updateIsTakingOver(status: UpdateStatus): boolean {
  return status.state === 'ready';
}

/**
 * What the small place beside the settings shows, for the next version.
 *
 * The words are the parts of the little mark: nothing, something is being
 * looked for, a version was seen, the version is here, and the look went
 * wrong.
 */
export type UpdateBadge =
  | 'none'
  | 'busy'
  | 'coming'
  | 'here'
  | 'trouble';

export function updateBadge(status: UpdateStatus): UpdateBadge {
  switch (status.state) {
    case 'checking':
    case 'downloading':
      return 'busy';
    case 'available':
      return 'coming';
    case 'ready':
      return 'here';
    case 'error':
      return 'trouble';
    default:
      return 'none';
  }
}

/**
 * How much of the download the mark can show as it goes, or nothing when
 * there is no download to follow.
 */
export function updateProgress(status: UpdateStatus): number | null {
  return status.state === 'downloading' ? status.percent : null;
}

/**
 * What the small place beside the settings says — for the ear that reads a
 * button before it presses it, and for the hand that rests on one.
 */
export function updateMarkWords(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Check for an update';
    case 'checking':
      return 'Looking for an update…';
    case 'available':
      return 'An update was found';
    case 'downloading':
      return `Downloading the update — ${status.percent}%`;
    case 'ready':
      return 'The update is ready: the app restarts by itself';
    case 'current':
      return 'The app is up to date';
    case 'error':
      return 'The look for an update failed';
    case 'unsupported':
      return 'The app as it runs from the sources cannot look for an update';
  }
}

/** One line of the history: what GitHub has published, said plainly. */
export type ReleaseRow = {
  /** The version, the way a release is named: `v1.2.0`. */
  tag: string;
  /** What the release calls itself. */
  name: string;
  /** When it was published, the way Github wrote it. */
  date: string;
  /** A rehearsal: a release people have to ask for by name. */
  prerelease: boolean;
  /** Where the release lives, on the page of the project. */
  url: string;
};

/**
 * Trims what Github sends into what the page reads: what is published, the
 * newest first, ten at the most. Whatever Github did not say is left out,
 * and nothing of it makes the page fall over.
 */
export function releaseRows(list: unknown): ReleaseRow[] {
  if (!Array.isArray(list)) return [];
  const rows: ReleaseRow[] = [];
  for (const one of list) {
    const note = (one ?? {}) as Record<string, unknown>;
    if (note.draft === true) continue;
    const tag = typeof note.tag_name === 'string' ? note.tag_name : '';
    if (!tag) continue;
    rows.push({
      tag,
      name: typeof note.name === 'string' && note.name ? note.name : tag,
      date: typeof note.published_at === 'string' ? note.published_at : '',
      prerelease: note.prerelease === true,
      url: typeof note.html_url === 'string' ? note.html_url : '',
    });
    if (rows.length === 10) break;
  }
  return rows;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * What a release date says, in the words people read. The parts come from
 * the clock of the world, not of the machine, so the same release says the
 * same thing on every Mac.
 */
export function releaseDateWords(date: string): string {
  if (!date) return '';
  const when = new Date(date);
  if (Number.isNaN(when.getTime())) return '';
  return `${MONTHS[when.getUTCMonth()]} ${when.getUTCDate()}`;
}
