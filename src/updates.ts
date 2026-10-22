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
  /** Why it went wrong, when it did. */
  message?: string;
};

export type UpdateStatus = {
  state: UpdateState;
  /** The version that was found, or the one the app is running. */
  version: string;
  /** How much of the download is on the disk, out of a hundred. */
  percent: number;
  /** Why it went wrong, when it did. */
  message: string;
};

/** Nothing is known yet: the app has not been asked anything. */
export function initialUpdateStatus(): UpdateStatus {
  return { state: 'idle', version: '', percent: 0, message: '' };
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
