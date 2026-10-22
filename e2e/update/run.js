'use strict';

// The update, the way a person meets it.
//
// Two real builds are made: the one that is installed, and the one that is
// published. The published one is served as a release feed. The installed
// one is launched, the button is pressed, and the app is expected to become
// the version that was published — on disk, and running.
//
// Nothing here is mocked: the app is built, signed, launched, downloaded
// from, replaced and relaunched for real.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { serveFeed } = require('./feed-server');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'e2e', 'out');
const FEED = path.join(ROOT, 'e2e', 'feed');
const APPS = path.join(ROOT, 'e2e', 'apps');
const HOME = path.join(ROOT, 'e2e', 'home');
const PORT = 7788;
const DEBUG_PORT = 9222;
const APP_NAME = 'Hermes Bot.app';

function log(line) {
  console.log(line);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...options,
  });
}

function versionOf(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  return execFileSync('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    plist,
  ])
    .toString()
    .trim();
}

/** Waits for a while, and says whether it was enough. */
async function until(what, check, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The page the app is showing, over the debugging port. */
async function findPage() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const targets = await response.json();
  // The window of the app draws index.html; take it rather than any other
  // page the process happens to hold.
  return targets.find(
    (target) =>
      target.type === 'page' && target.webSocketDebuggerUrl && target.url.includes('index.html'),
  );
}

/** Says something to the page, and reads what it answers. */
async function say(socket, expression) {
  const result = await command(socket, 'Runtime.evaluate', { expression });
  return result?.result?.value;
}

/** Asks the page to do something, and reads what it answers. */
async function command(socket, method, params) {
  const id = command.counter++;
  const answer = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the page did not answer')), 10000);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
  });
  socket.send(JSON.stringify({ id, method, params }));
  return answer;
}
command.counter = 1;

/** What the page looks like, as a picture. */
async function shot(socket, file) {
  const picture = await command(socket, 'Page.captureScreenshot', {
    format: 'png',
  });
  if (!picture?.data) throw new Error('the page could not be pictured');
  fs.writeFileSync(file, Buffer.from(picture.data, 'base64'));
  return file;
}

async function openSocket() {
  const page = await until('the page of the app', async () => {
    try {
      return await findPage();
    } catch {
      // The port answers nothing while the app is still waking: wait.
      return false;
    }
  });
  if (typeof page?.webSocketDebuggerUrl !== 'string') {
    // The page is there, but it gives no address to reach it by: say it
    // plainly rather than open a socket that cannot be opened.
    throw new Error('the page cannot be reached');
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  // The page has to be drawn before it can be pictured.
  await command(socket, 'Page.enable', {});
  return socket;
}

/** Clicks the button that says what it says. */
const clickByText = (text) => `(() => {
  const button = [...document.querySelectorAll('button')]
    .find((one) => one.textContent.trim() === ${JSON.stringify(text)});
  if (!button) return 'not found';
  button.click();
  return 'clicked';
})()`;

async function build(which, config) {
  log(`building ${which}…`);
  run('npx', [
    'electron-builder',
    '--mac',
    '--config',
    config,
    '--publish',
    'never',
  ]);
}

/**
 * The whole of it: build, publish, install, press the button, and check that
 * the app became the version that was published.
 */
async function main() {
  // A run that died late leaves both versions on the disk: with --no-build,
  // only what comes after is done again, without nine minutes of builds.
  const reuse =
    process.argv.includes('--no-build') &&
    fs.existsSync(path.join(APPS, APP_NAME, 'Contents', 'Info.plist')) &&
    fs.existsSync(path.join(OUT, 'v2', 'Hermes Bot-1.0.1-arm64-mac.zip'));

  if (reuse) {
    log('the two versions are already here: they are kept (--no-build)');
  } else {
    // The feed holds the new version: the same files a releases page holds.
    fs.rmSync(FEED, { recursive: true, force: true });
    fs.mkdirSync(FEED, { recursive: true });

    await build('the version that is installed', 'e2e/update/electron-builder.e2e.json');
    await build('the version that is published', 'e2e/update/electron-builder.e2e.next.json');

    // Only the zip is published, and only the app is installed: the rest of
    // the two builds is of no use to the test, and a full disk makes the
    // update fail for a reason that has nothing to do with the update.
    for (const name of fs.readdirSync(path.join(OUT, 'v1'))) {
      if (name.endsWith('.zip') || name.endsWith('.blockmap')) {
        fs.rmSync(path.join(OUT, 'v1', name), { force: true });
      }
    }
    fs.rmSync(path.join(OUT, 'v2', 'mac-arm64'), { recursive: true, force: true });

    // The installed app: the first version, in the place an app lives.
    fs.rmSync(APPS, { recursive: true, force: true });
    fs.mkdirSync(APPS, { recursive: true });
    // ditto is the copier macOS uses for a bundle: it keeps the symlinks and
    // the signature, and the signature is what lets the update be installed.
    run('/usr/bin/ditto', [
      path.join(OUT, 'v1', 'mac-arm64', APP_NAME),
      path.join(APPS, APP_NAME),
    ]);
    // The build the app came from is of no use now that it is installed.
    fs.rmSync(path.join(OUT, 'v1', 'mac-arm64'), { recursive: true, force: true });
  }

  // The feed holds the new version: the same files a releases page holds.
  fs.mkdirSync(FEED, { recursive: true });
  for (const name of fs.readdirSync(path.join(OUT, 'v2'))) {
    if (name.startsWith('latest-') || name.endsWith('.zip') || name.endsWith('.blockmap')) {
      fs.copyFileSync(path.join(OUT, 'v2', name), path.join(FEED, name));
    }
  }

  const installed = path.join(APPS, APP_NAME);

  // The app keeps one thing of its own: whether the setup was walked
  // through. The test says yes, so the app opens on its window and not on
  // the setup.
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(
    path.join(HOME, 'hermes-connection.json'),
    JSON.stringify({
      connection: { sshHost: '', apiPort: 8642, localPort: 18742, autoConnect: false },
      onboarding: { completed: true, completedAt: new Date().toISOString() },
    }),
  );

  // The cache of a previous update would confuse the test.
  fs.rmSync(path.join(process.env.HOME, 'Library', 'Caches', 'hermes-bot-updater'), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(process.env.HOME, 'Library', 'Caches', 'app.hermesbot.desktop.e2e.ShipIt'), {
    recursive: true,
    force: true,
  });

  const before = versionOf(installed);
  if (before !== '1.0.0') {
    // The dance only has a meaning from one version to the next: start from
    // the beginning, without --no-build.
    throw new Error(`the installed app is ${before}; the dance starts at 1.0.0`);
  }
  log(`installed version: ${before}`);

  const feed = await serveFeed(FEED, PORT);
  log(`feed served at ${feed.url}`);

  const appLog = path.join(ROOT, 'e2e', 'app.log');
  fs.writeFileSync(appLog, '');
  const logHandle = fs.openSync(appLog, 'a');

  const app = spawn(
    path.join(installed, 'Contents', 'MacOS', 'Hermes Bot'),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${HOME}`,
      // The button is the one being tested: the launch does not look by
      // itself, so the download and the restart are that button's doing.
      '--no-update-on-launch',
    ],
    {
      detached: true,
      stdio: ['ignore', logHandle, logHandle],
      // The app must run as an app, not as node: the flag in the shell
      // would turn it into a node process and nothing would happen.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    },
  );
  app.on('error', (error) => log(`the app could not be started: ${error.message}`));
  app.unref();

  try {
    const socket = await openSocket();

    // The page of the app, and the page of the settings.
    await until('the app to show itself', async () => {
      return (await say(socket, 'document.title')) !== undefined;
    });
    log('the app is open');

    log('opening the settings…');
    // The entry exists once the app has drawn its sidebar: wait for it. If
    // it never comes, say what the page is showing instead.
    try {
      await until('the entry of the settings', async () => {
        // A node does not travel the bridge: ask for a word, not a thing.
        return (
          (await say(socket, "document.querySelector('.settings-entry') !== null")) === true
        );
      });
    } catch {
      const what = await say(
        socket,
        `JSON.stringify({ title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 400) })`,
      );
      throw new Error(`the entry of the settings is not there; the page holds: ${what}`);
    }
    const openedSettings = await say(
      socket,
      `(() => {
        const entry = document.querySelector('.settings-entry');
        if (!entry) return 'not found';
        entry.click();
        return 'clicked';
      })()`,
    );
    if (openedSettings !== 'clicked') throw new Error('the settings did not open');

    // The view is open when its own navigation is drawn: the word
    // "Settings" is written on the closed sidebar too, so it says nothing.
    await until('the settings to open', async () => {
      return (
        (await say(socket, "document.querySelector('.settings-nav-item') !== null")) === true
      );
    });

    log('opening the page of updates…');
    const opened = await say(socket, clickByText('Updates'));
    if (opened !== 'clicked') {
      const page = await say(socket, `document.body.innerText.slice(0, 300)`);
      throw new Error(`the page of updates did not open; the page reads: ${page}`);
    }

    await until('the button of the update', async () => {
      return (
        (await say(
          socket,
          `[...document.querySelectorAll('button')].some((one) => one.textContent.trim() === 'Check for updates')`,
        )) === true
      );
    });
    log('the button is there');
    await shot(socket, path.join(ROOT, 'e2e', 'updates-page.png'));
    log('the page was pictured');

    log('pressing the button…');
    const pressed = await say(socket, clickByText('Check for updates'));
    if (pressed !== 'clicked') throw new Error('the button did not answer');

    // The app looks, and the feed is asked for the version.
    await until('the feed to be asked', async () => {
      return feed.requests.some((name) => name.includes('latest-mac.yml'));
    });
    log(`the feed was asked for: ${feed.requests.join(', ')}`);

    await until('the version to be downloaded', async () => {
      return feed.requests.some((name) => name.endsWith('.zip'));
    }, 120000);
    log('the version is downloaded');
    await shot(socket, path.join(ROOT, 'e2e', 'updates-download.png'));

    // The app closes, takes the version, and comes back as it.
    await until('the app to become the new version', async () => {
      return versionOf(installed) === '1.0.1';
    }, 180000);

    log(`installed version now: ${versionOf(installed)}`);
    log('the app log says:');
    const said = fs
      .readFileSync(appLog, 'utf8')
      .split('\n')
      .filter((line) => !/icudtl|icu_util|GPU process|gpu_process_host|network_service/.test(line))
      .slice(-12);
    for (const line of said) log(`  ${line}`);

    log('');
    log('THE UPDATE WORKS: the app became 1.0.1.');
  } finally {
    await feed.close();
    try {
      execFileSync('/usr/bin/pkill', ['-f', 'grok-bot-auto-update/e2e/apps']);
    } catch {
      // The app is already gone.
    }
  }
}

main().catch((error) => {
  console.error('THE UPDATE DOES NOT WORK:', error.message);
  // What the app said, if it said anything: it is the only witness.
  try {
    const said = fs
      .readFileSync(path.join(ROOT, 'e2e', 'app.log'), 'utf8')
      .split('\n')
      .filter((line) => !/icudtl|icu_util|GPU process|gpu_process_host|network_service/.test(line))
      .slice(-8);
    if (said.length) {
      console.error('— the app’s log:');
      for (const line of said) console.error(`  ${line}`);
    }
  } catch (
    // The app said nothing at all.
    {
      /* nothing to read */
    }
  ) {}
  process.exitCode = 1;
});
