# The update, tested for real

This is not a mock. Two real builds of Hermes Bot are made, signed the way a
release is signed, and published to a feed that is served over HTTP the way a
releases page is served. The first one is installed like an app is installed,
launched, and the button in **Settings → Updates** is pressed — by clicking
it in the running app, through the debugging port.

The test passes when the installed app has *become* the published version:
the version on disk changes, and the app comes back as itself.

```bash
npm run test:update
```

It takes a while: two full builds of the app, a download, and an install.
It needs about a gigabyte and a half of free disk, and a machine with the
signing identity the release uses.

## What it does

1. **Builds** the app twice: once as `1.0.0`, once as `1.1.0`.
2. **Serves** the second build as a release feed, on `127.0.0.1:7788`.
3. **Installs** the first build with `ditto`, the copier macOS uses for a
   bundle: it keeps the symlinks and the signature, and the signature is
   what lets an update be installed.
4. **Launches** it with a clean profile of its own, so the setup does not
   stand in the way.
5. **Presses** the button: open the settings, open *Updates*, press *Check
   for updates*.
6. **Waits** for the app to close, take the new version, and come back.
7. **Checks** that the version on disk is now `1.1.0`.

## The files

| File | What it is |
|---|---|
| `run.js` | The whole of it: build, publish, install, press, check |
| `feed-server.js` | The release feed, served from a directory on disk |
| `electron-builder.e2e.json` | The build of the version that is installed |
| `electron-builder.e2e.next.json` | The build of the version that is published |
| `probe.js` | A short question: does the app install a new version at all? |

## The traps

- **`ELECTRON_RUN_AS_NODE`.** If the flag is set in your shell, the app runs
  as node: the main script never starts, and nothing happens at all. The
  harness unsets it for the app it launches.
- **A full disk.** The update needs room to be unpacked. The harness deletes
  what it does not need as it goes, but a disk with a gigabyte free is
  enough to fail for a reason that has nothing to do with the update.
