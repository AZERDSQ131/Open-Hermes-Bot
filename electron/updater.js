'use strict';

// The app finds its own next version on the releases page, the way every
// other app does. This file holds the whole of that: what is looked for,
// what is downloaded, and when the new version takes over.
//
// The renderer draws what happens here and never talks to the release feed
// itself. Everything the shell needs is handed in, so this file can be
// exercised without an app around it.

const IDLE = 'idle';
const CHECKING = 'checking';
const AVAILABLE = 'available';
const DOWNLOADING = 'downloading';
const READY = 'ready';
const CURRENT = 'current';
const ERROR = 'error';
const UNSUPPORTED = 'unsupported';

const UNSUPPORTED_MESSAGE =
  'Updates are found by the installed app, not by a copy running from the sources.';

/**
 * The updater of Hermes Bot.
 *
 * @param {object} options
 * @param {{ isPackaged: boolean, getVersion: () => string }} options.app
 * @param {object} options.autoUpdater the electron-updater instance
 * @param {(event: object) => void} options.onEvent tells the shell what happened
 */
function createUpdater({ app, autoUpdater, onEvent }) {
  // The download is ours to ask for: the app decides when it happens, and
  // why. electron-updater would otherwise start it on its own.
  autoUpdater.autoDownload = false;

  /** The version that was found on the releases page. */
  let found = '';
  /** When that version was published, as the page said it. */
  let released = '';
  /** The new version is on the disk: it can take over the app. */
  let ready = false;
  /** The app is already leaving: the install happens once. */
  let leaving = false;
  /** The check running now, and the promise that answers it. */
  let pending = null;
  /** The check running now is one the person asked for. */
  let asked = false;

  function emit(state, extra) {
    // The check on launch is quiet: it downloads in the background and waits
    // for the app to close. Only a check the person asked for is reported.
    if (!asked) return;
    onEvent({
      state,
      version: found,
      released,
      percent: 0,
      message: '',
      ...extra,
    });
  }

  /** Says something to the person, whatever check is running. */
  function tell(state, extra) {
    const before = asked;
    asked = true;
    emit(state, extra);
    asked = before;
  }

  function answer(result) {
    const running = pending;
    pending = null;
    if (running) running.resolve(result);
  }

  autoUpdater.on('update-available', (info) => {
    found = info?.version ?? found;
    released = info?.releaseDate ?? released;
    emit(AVAILABLE);
    // The download is ours to ask for: the person pressed the button, or the
    // app is getting ready for its next launch.
    autoUpdater.downloadUpdate().catch(() => undefined);
  });

  autoUpdater.on('update-not-available', () => {
    emit(CURRENT, { version: app.getVersion() });
    answer({ ok: true, state: CURRENT, version: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress) => {
    emit(DOWNLOADING, { percent: Math.round(progress?.percent ?? 0) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    found = info?.version ?? found;
    released = info?.releaseDate ?? released;
    ready = true;
    emit(READY, { percent: 100 });
    answer({ ok: true, state: READY, version: found });
  });

  // Without this listener an update that goes wrong takes the app down with
  // it: the error event of an EventEmitter nobody listens to is thrown.
  autoUpdater.on('error', (error) => {
    const message = error?.message ?? String(error);
    emit(ERROR, { message });
    answer({ ok: false, state: ERROR, message });
  });

  /** What the app knows about itself: the version, and whether it can look. */
  function info() {
    return {
      version: app.getVersion(),
      supported: Boolean(app.isPackaged),
    };
  }

  /**
   * Looks for a new version, on behalf of the person who asked.
   *
   * @returns {Promise<object>} how it ended: ready, current, unsupported or
   *   an error.
   */
  function check() {
    if (!app.isPackaged) {
      // A copy running from the sources has no releases page of its own.
      tell(UNSUPPORTED, { message: UNSUPPORTED_MESSAGE });
      return Promise.resolve({
        ok: false,
        state: UNSUPPORTED,
        message: UNSUPPORTED_MESSAGE,
      });
    }
    if (ready) {
      // The version is already on the disk: there is nothing left to look for.
      tell(READY, { percent: 100 });
      return Promise.resolve({ ok: true, state: READY, version: found });
    }
    if (pending) {
      // A check is already running: the person waits for that one.
      asked = true;
      return pending.promise;
    }
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    pending = { promise, resolve };
    asked = true;
    emit(CHECKING);
    // The failure comes through the error event above, not through here.
    autoUpdater.checkForUpdates().catch(() => undefined);
    return promise;
  }

  /** The check on launch: it downloads and waits for the app to close. */
  function checkInBackground() {
    if (!app.isPackaged || pending) return;
    let resolve;
    pending = {
      promise: new Promise((settle) => {
        resolve = settle;
      }),
      resolve,
    };
    asked = false;
    autoUpdater.checkForUpdates().catch(() => undefined);
  }

  /**
   * Lets the new version take over: the app closes and comes back as the
   * version that was downloaded.
   *
   * @returns {boolean} whether the app is on its way out.
   */
  function install() {
    if (leaving || !ready) return false;
    leaving = true;
    try {
      // Not silent, and the app comes back: the person asked for this.
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (error) {
      leaving = false;
      const message = error?.message ?? String(error);
      tell(ERROR, { message });
      return false;
    }
  }

  /** The app is closing: the update takes over now, if there is one. */
  function installOnQuit() {
    if (!ready) return false;
    return install();
  }

  return {
    info,
    check,
    checkInBackground,
    install,
    installOnQuit,
    isReady: () => ready,
  };
}

module.exports = { createUpdater, UNSUPPORTED_MESSAGE };
