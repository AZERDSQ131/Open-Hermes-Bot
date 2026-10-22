# Security

The app is an interface; Hermes is the harness. That boundary is the whole of
this page: the app carries a turn to a host you named and draws what comes
back. It runs no model, it keeps no transcript, and it talks to nobody but the
host you named and GitHub.

## What the app holds

- **The API key of your Hermes host**, in the login Keychain, under the
  service `Hermes Bot` and the account `Hermes API key`. It is written and
  read with `/usr/bin/security`, never with a file. The window is told whether
  a key is there (`hasKey`), and how long it is when it is imported — never
  what it is.
- **The connection record**, in
  `~/Library/Application Support/Hermes Bot/hermes-connection.json`, mode
  `0600`: where Hermes runs, the host when it runs elsewhere, the API port,
  the local tunnel port, and the fact that the setup was walked through.
- **The PID of the tunnel**, in `hermes-tunnel.pid`, mode `0600`, so that an
  `ssh` that outlived the app can be reaped.
- **An installation id**, in `.updaterId`: a UUID that says *this copy* and
  nothing about you. The updater sends it to GitHub, and it is what a
  staged rollout is measured against.
- **No conversation, no transcript, no preference.** They live on the host,
  where Hermes keeps them. The app writes no `localStorage`, no cookie and no
  `IndexedDB` of its own.

The key of a bot — the `API_SERVER_KEY` of its profile — is read from
`$HOME/.hermes/profiles/<profile>/.env` on the machine that runs Hermes, over
the connection the app already has, and is kept in memory for the length of
the session. The app never writes it. In `local` mode that file is on this
machine already, and the app reads it from here.

**Read it from this Mac** and **Read it from \<host\>** read
`API_SERVER_KEY` from the `.env` of the Hermes home, over SSH when the host
is elsewhere, and put it in the Keychain. The key is not written on the way:
it goes from the file, through the app's hands, into the Keychain.

## What it does with it

Every call to Hermes goes to `http://127.0.0.1:<port>` — the API port itself
when Hermes runs here, the forwarded port when it runs elsewhere. The key
travels as a `Bearer` header on those calls and nowhere else. It is never
written to a file, never printed, and never handed to the window.

When Hermes runs on another machine, the app opens a tunnel:

```
ssh -N -L 127.0.0.1:<local>:<api> <host>
```

Both ends are the loopback: nothing is exposed on the network, and the server
is not asked to open a port. Host key checking is left at the OpenSSH default
— the app never sets `StrictHostKeyChecking=no` — and the connection runs in
`BatchMode`, so an unknown host fails instead of being trusted or asked
about. The tunnel is closed when the app quits, and an `ssh` that outlived it
is reaped on the next start.

Commands sent to the host — reading the bots, writing a profile, copying an
attachment — ride the same SSH connection, or run here through `/bin/bash`
when Hermes is on this machine. Nothing the window sends is a command line: a
name is checked against a pattern, a title is quoted, and a file or a
recording goes down a pipe, never down an argument.

## What the app does to the host

Worth knowing, because it is the app's own doing and not Hermes':

- **Creating a bot copies the primary profile.** Its `config.yaml`, its
  `SOUL.md`, its `MEMORY.md` and `USER.md`, and its `skills` are copied into
  the new bot's profile. So is the primary `.env`, minus the API key, the
  gateway keys and the messaging tokens — the keys of your model providers
  are copied along. The new bot gets a key of its own, made with `openssl`,
  and its `.env` is `chmod 600`.
- **Deleting a bot removes its profile**, with `rm -rf`, on the host.
- **In `local` mode the app runs shell scripts as you**, with your own
  permissions, and writes to `/tmp` while it does it.

## What leaves this machine

- **To the host you named**: the API key, what you write to a bot, the
  attachments you give it, and the recording you dictate. The host is the
  agent's own memory, and it is where the conversation is.
- **To GitHub**: your IP address, and three things about this copy of the app.
  - the history of the releases, asked for **Settings → Updates**, with
    `User-Agent: Hermes-Bot`;
  - the update feed and the build itself, with `User-Agent: electron-builder`
    and a header `x-user-staging-id` carrying the UUID of `.updaterId`.
  - No token, no key, no host name, no user name. The requests are
    unauthenticated.

There is **no telemetry, no analytics, and no crash reporting**. The
installation id is the one identifier the app keeps, and it says *this copy*,
not *you*. No other service is contacted.

The update is looked for on every launch, and a build that is found is
downloaded straight away — around 130 MB — without asking.

## The window it runs in

The renderer is locked down, and the lock is in the code:

- `contextIsolation` on, `nodeIntegration` off, `sandbox` on.
- The preload exposes a fixed list of calls; there is no bridge that hands
  the window Node, the filesystem, or the key.
- The content security policy of the built app allows the app's own scripts
  and nothing else: no inline script, no remote script, no connection but the
  app's own. The page is loaded from a file, so `'self'` is the file itself
  and the loopback port is out of reach of the window. The window makes **no
  network call of its own** — every request is made by the shell.
- The permission handler grants the `media` permission — which Chromium
  treats as audio **or** video. The app only ever asks for audio. The bundle
  does carry Electron's default camera description, so macOS would ask you
  before giving the camera to anything; the app never asks for it. The grant
  itself is not tied to the moment you dictate: it is a permission of the
  app, not of the recording.
- No `webview`, no remote page, no iframe, no remote image. The last four
  hold by what the code does today, not by a wall: there is no `will-navigate`
  guard, and a window that asked to open would be handed to your browser
  without a check of the address.

The window can ask the shell for the transcript of **any** session of the
host, by its id — not only the one on screen.

## Updates, and how they are checked

The app looks for its next version on the releases page and takes it over
when you close it.

The build that is downloaded is checked in two ways. The SHA-512 in
`latest-mac.yml` must match the file — that catches a broken or half-written
download, and nothing more, because the digest comes from the same place as
the file. Then Squirrel.Mac, inside the app, asks the new bundle to satisfy
the **designated requirement** of the app that is running, and refuses it if
it does not. A build signed by another certificate is refused.

Be plain about what that is worth:

- **The build published by the release workflow is not signed.** The workflow
  runs on a machine that has no signing identity, and `electron-builder`
  warns and carries on rather than failing. The releases on the project page
  are therefore unsigned, and there is no signature for Squirrel.Mac to
  compare against. **A build made on a Mac with an identity in its Keychain
  is signed** — that one is what a local build gives you, and it is what the
  update chain can anchor on.
- **The build is not notarized.** macOS therefore greets the app like it
  greets any program it has never seen, and it has to be opened once by hand.
- **A development certificate is a personal anchor, and it expires.** When it
  does, the update chain closes and the app has to be updated by hand.

## The limits of this page

Things that are true today and worth saying out loud:

- The key is handed to `/usr/bin/security` as an argument, so for the length
  of that call it is visible in the process table to the other processes of
  your own account.
- The Keychain item is in the **login** keychain, written without a
  restriction: any program running as you can read it, without a prompt.
  That is the point of the choice — the app reads it without asking you every
  time — and it is also the cost of it.
- The commands the app runs inherit its environment, including anything
  secret that is in it.
- The window is offered the host names of your `~/.ssh/config`, so that the
  setup can offer them.
- The file mode `0600` is applied when `hermes-connection.json` is written;
  a file that already exists keeps the mode it had. The same goes for
  `hermes-tunnel.pid`.
- The folder `~/Library/Application Support/Grok Bot/`, from before the
  rename, is left where it is. The app neither reads it nor deletes it: you
  can remove it yourself.
- `electron/main.js` carries the SSH, the tunnel and the shell commands, and
  the coverage gate does not reach it. The rules it holds are the ones a
  careful read has to check.
- `electron/updater.js` — the rules of the update — is out of the gate too,
  for an accident: the coverage configuration names its files twice, and the
  second naming wins. Its threshold of 100 % therefore passes on nothing.

## Reporting a problem

If you find something wrong — a key that leaks, a tunnel that listens where
it should not, a conversation that ends up somewhere it should not — report it
privately:

<https://github.com/AZERDSQ131/Open-Hermes-Bot/security/advisories/new>

Please do not open a public issue for a vulnerability. You will get an answer.

A report that names the version of the app, the version of Hermes, the mode
it runs in (this Mac or another), and the steps that lead to the problem is
worth ten that do not.
