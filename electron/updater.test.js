import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// The updater is a CommonJS module, because the shell that uses it runs in
// the Electron main process. The test loads it the way Node does.
const require = createRequire(import.meta.url);
const { createUpdater, UNSUPPORTED_MESSAGE } = require('./updater.js');

function fakeApp({ packaged = true, version = '1.0.0' } = {}) {
  return { isPackaged: packaged, getVersion: () => version };
}

function fakeUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn(() => Promise.resolve(null));
  updater.downloadUpdate = vi.fn(() => Promise.resolve([]));
  updater.quitAndInstall = vi.fn();
  return updater;
}

function harness(options = {}) {
  const app = fakeApp(options.app);
  const autoUpdater = fakeUpdater();
  const events = [];
  const updater = createUpdater({
    app,
    autoUpdater,
    onEvent: (event) => events.push(event),
  });
  return { app, autoUpdater, events, updater };
}

/** Lets the promises of the updater settle. */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('what the app knows about itself', () => {
  it('says the version it is running', () => {
    const { updater } = harness({ app: { version: '1.2.3' } });
    expect(updater.info()).toEqual({ version: '1.2.3', supported: true });
  });

  it('says it cannot look when it is not installed', () => {
    const { updater } = harness({ app: { packaged: false } });
    expect(updater.info().supported).toBe(false);
  });
});

describe('a check the person asked for', () => {
  it('looks for the version', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ state: 'checking' });
    autoUpdater.emit('update-not-available');
    await check;
  });

  it('says the version it found, and downloads it', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'available', version: '1.1.0' }),
    );
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    autoUpdater.emit('update-not-available');
    await check;
  });

  it('says how far the download has come', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('download-progress', { percent: 42.4 });
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'downloading', percent: 42 }),
    );
    autoUpdater.emit('update-not-available');
    await check;
  });

  it('ends with the version ready', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    expect(await check).toEqual({
      ok: true,
      state: 'ready',
      version: '1.1.0',
    });
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'ready', version: '1.1.0' }),
    );
  });

  it('ends with the app being up to date', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-not-available');
    expect(await check).toEqual({
      ok: true,
      state: 'current',
      version: '1.0.0',
    });
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'current', version: '1.0.0' }),
    );
  });

  it('ends with the reason it could not look', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('error', new Error('no network'));
    expect(await check).toEqual({
      ok: false,
      state: 'error',
      message: 'no network',
    });
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'error', message: 'no network' }),
    );
  });

  it('does not fall over when the error carries no reason', async () => {
    const { updater, autoUpdater } = harness();
    const check = updater.check();
    autoUpdater.emit('error', 'something went wrong');
    expect((await check).message).toBe('something went wrong');
  });

  it('waits for the check that is already running', async () => {
    const { updater, autoUpdater } = harness();
    const first = updater.check();
    const second = updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    autoUpdater.emit('update-not-available');
    expect(await second).toEqual(await first);
  });

  it('cannot look when the app is not installed', async () => {
    const { updater, autoUpdater, events } = harness({
      app: { packaged: false },
    });
    const result = await updater.check();
    expect(result).toEqual({
      ok: false,
      state: 'unsupported',
      message: UNSUPPORTED_MESSAGE,
    });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ state: 'unsupported' }),
    );
  });

  it('finds the version that is already on the disk', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    // The second ask finds nothing left to look for.
    const again = await updater.check();
    expect(again).toEqual({ ok: true, state: 'ready', version: '1.1.0' });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.state === 'ready')).toHaveLength(2);
  });
});

describe('the check on launch', () => {
  it('looks without saying anything', async () => {
    const { updater, autoUpdater, events } = harness();
    updater.checkInBackground();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('download-progress', { percent: 50 });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await tick();
    expect(events).toEqual([]);
  });

  it('does not look when a check is already running', () => {
    const { updater, autoUpdater } = harness();
    updater.check();
    updater.checkInBackground();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('does not look when the app is not installed', () => {
    const { updater, autoUpdater } = harness({ app: { packaged: false } });
    updater.checkInBackground();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});

describe('the new version taking over', () => {
  it('happens when the version is on the disk', async () => {
    const { updater, autoUpdater } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    expect(updater.install()).toBe(true);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('does not happen when there is no version to take over with', () => {
    const { updater, autoUpdater } = harness();
    expect(updater.install()).toBe(false);
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('happens only once', async () => {
    const { updater, autoUpdater } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    expect(updater.install()).toBe(true);
    expect(updater.install()).toBe(false);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('says so when the app cannot leave', async () => {
    const { updater, autoUpdater, events } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    autoUpdater.quitAndInstall = vi.fn(() => {
      throw new Error('the app cannot leave');
    });
    expect(updater.install()).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        state: 'error',
        message: 'the app cannot leave',
      }),
    );
  });

  it('happens when the app closes, if there is one waiting', async () => {
    const { updater, autoUpdater } = harness();
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    expect(updater.installOnQuit()).toBe(true);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('does not happen when the app closes with nothing waiting', () => {
    const { updater, autoUpdater } = harness();
    expect(updater.installOnQuit()).toBe(false);
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('knows that the version is on the disk', async () => {
    const { updater, autoUpdater } = harness();
    expect(updater.isReady()).toBe(false);
    const check = updater.check();
    autoUpdater.emit('update-available', { version: '1.1.0' });
    autoUpdater.emit('update-downloaded', { version: '1.1.0' });
    await check;
    expect(updater.isReady()).toBe(true);
  });
});
