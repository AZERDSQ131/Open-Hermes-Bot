'use strict';

// A quick, dirty probe: does the app install a new version on a machine
// where the app is signed with a development certificate?
//
// The answer decides how the update is put in place, so it is asked of the
// real thing: a real build, a real feed, a real install.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { serveFeed } = require('./feed-server');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'e2e', 'out');
const FEED = path.join(ROOT, 'e2e', 'feed');
const APPS = path.join(ROOT, 'e2e', 'apps');
const PORT = 7788;

function versionOf(appPath) {
  const plist = path.join(
    appPath,
    'Contents',
    'Info.plist',
  );
  const output = execFileSync('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    plist,
  ]).toString();
  return output.trim();
}

async function main() {
  // The feed holds the new version: the same files a releases page holds.
  fs.rmSync(FEED, { recursive: true, force: true });
  fs.mkdirSync(FEED, { recursive: true });
  for (const name of fs.readdirSync(path.join(OUT, 'v2'))) {
    if (name.startsWith('latest-') || name.endsWith('.zip') || name.endsWith('.blockmap')) {
      fs.copyFileSync(
        path.join(OUT, 'v2', name),
        path.join(FEED, name),
      );
    }
  }

  // The installed app: v1, in the place an app lives.
  fs.rmSync(APPS, { recursive: true, force: true });
  fs.mkdirSync(APPS, { recursive: true });
  const installed = path.join(APPS, 'Hermes Bot.app');
  // ditto is the copier macOS uses for a bundle: it keeps the symlinks and
  // the signature, and the signature is what lets the update be installed.
  execFileSync('/usr/bin/ditto', [
    path.join(OUT, 'v1', 'mac-arm64', 'Hermes Bot.app'),
    installed,
  ]);

  // The cache of a previous update would confuse the test.
  fs.rmSync(path.join(process.env.HOME, 'Library', 'Caches', 'hermes-bot-updater'), {
    recursive: true,
    force: true,
  });

  const feed = await serveFeed(FEED, PORT);
  console.log('feed served at', feed.url);
  console.log('installed version before:', versionOf(installed));

  const logFile = path.join(ROOT, 'e2e', 'app.log');
  fs.writeFileSync(logFile, '');
  const log = fs.openSync(logFile, 'a');
  const app = spawn(
    path.join(installed, 'Contents', 'MacOS', 'Hermes Bot'),
    [],
    {
      detached: true,
      stdio: ['ignore', log, log],
      // The app must run as an app, not as node: the flag in the shell
      // would turn it into a node process and nothing would happen.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    },
  );
  app.unref();

  // Give the app time to find the version and download it.
  await new Promise((resolve) => setTimeout(resolve, 45000));

  console.log('feed requests:', feed.requests);
  console.log('installed version before quit:', versionOf(installed));

  // The app is closed: the update takes over.
  try {
    execFileSync('/usr/bin/osascript', [
      '-e',
      'tell application "Hermes Bot" to quit',
    ]);
  } catch (error) {
    console.log('quit by apple script failed:', error.message);
  }

  await new Promise((resolve) => setTimeout(resolve, 45000));

  console.log('installed version after quit:', versionOf(installed));
  await feed.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
