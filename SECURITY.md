# Security

The app is an interface; Hermes is the harness. That boundary is the whole of
this page: the app carries a turn to a host you named and draws what comes
back. It runs no model, it keeps no transcript, and it talks to nobody else.

## What the app holds

- **The API key of your Hermes host**, in the login Keychain, under the
  service `Hermes Bot` and the account `Hermes API key`. It is written and
  read with `/usr/bin/security`, never with a file. The window is told whether
  a key is there (`hasKey`), never what it is.
- **The connection record**, in
  `~/Library/Application Support/Hermes Bot/hermes-connection.json`, mode
  `0600`: where Hermes runs, the host when it runs elsewhere, the API port,
  the local tunnel port, and the fact that the setup was walked through.
- **The PID of the tunnel**, in `hermes-tunnel.pid`, mode `0600`, so that an
  `ssh` that outlived the app can be reaped.
- **Nothing else.** No conversation, no transcript, no preference, no
  `localStorage`, no cookie, no `IndexedDB`: those live on the host, where
  Hermes keeps them.

The key of a bot — the `API_SERVER_KEY` of its profile — is read from
`$HOME/.hermes/profiles/<profile>/.env` on the machine that runs Hermes, over
the connection the app already has, and is kept in memory for the length of
the session. It is never written on this machine.

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
— the app never sets `StrictHostKeyChecking=no`, so an unknown host fails
instead of being trusted. The tunnel is closed when the app quits, and an
`ssh` that outlived it is reaped on the next start.

Commands sent to the host — reading the bots, writing a profile, copying an
attachment — ride the same SSH connection, or run here through `/bin/bash`
when Hermes is on this machine. Nothing the window sends is a command line: a
name is checked against a pattern, a title is quoted, and a file or a
recording goes down a pipe, never down an argument.

## What leaves this machine

- **To the host you named**: the API key, what you write to a bot, the
  attachments you give it, and the recording you dictate. The host is the
  agent's own memory, and it is where the conversation is.
- **To GitHub**: your IP address and a `User-Agent: Hermes-Bot`, and nothing
  else. Two requests only — the history of the releases, for
  **Settings → Updates**, and the update feed itself. No token, no key, no
  identifier of you or of your host is sent with them.

There is **no telemetry, no analytics, and no crash reporting**. No other
service is contacted — GitHub is asked for the releases and for the update,
and for nothing else — and the app holds no identifier of you.

## The window it runs in

The renderer is locked down, and the lock is in the code:

- `contextIsolation` on, `nodeIntegration` off, `sandbox` on.
- The preload exposes a fixed list of calls; there is no bridge that hands
  the window Node, the filesystem, or the key.
- The content security policy of the built app allows the app's own scripts
  and nothing else: no inline script, no remote script, no connection but the
  app's own. The window makes **no network call of its own** — every request
  is made by the shell.
- The permission handler grants the microphone and nothing else. The app
  records while you dictate and stops when you stop.
- No `webview`, no remote page, no iframe, no remote image.

## Updates, and how they are checked

The app looks for its next version on the releases page and takes it over
when you close it. The build that is downloaded is checked twice: the
SHA-512 in `latest-mac.yml` must match the file, and macOS validates the
signature of the downloaded bundle against the signature of the app that is
running. An update signed by another identity is refused.

Be plain about what that is worth: **the build is signed with whatever
identity is in the Keychain**, which today is an Apple Development
certificate, not a Developer ID, and **it is not notarized**. macOS therefore
greets the app like it greets any program it has never seen, and it has to
be opened once by hand. The trust anchor of the update chain is a personal
certificate, not a company's.

## The limits of this page

Things that are true today and worth saying out loud:

- The key is handed to `/usr/bin/security` as an argument, so for the length
  of that call it is visible in the process table to the other processes of
  your own account.
- The commands the app runs inherit its environment, including anything
  secret that is in it.
- The window is offered the host names of your `~/.ssh/config`, so that the
  setup can offer them.
- The file mode `0600` is applied when `hermes-connection.json` is written;
  a file that already exists keeps the mode it had.
- The folder `~/Library/Application Support/Grok Bot/`, from before the
  rename, is left where it is. The app neither reads it nor deletes it: you
  can remove it yourself.
- `electron/main.js` carries the SSH, the tunnel and the shell commands, and
  the coverage gate does not reach it. The rules it holds are the ones a
  careful read has to check.

## Reporting a problem

If you find something wrong — a key that leaks, a tunnel that listens where
it should not, a conversation that ends up somewhere it should not — report it
privately:

<https://github.com/AZERDSQ131/Open-Hermes-Bot/security/advisories/new>

Please do not open a public issue for a vulnerability. You will get an answer.

A report that names the version of the app, the version of Hermes, the mode
it runs in (this Mac or another), and the steps that lead to the problem is
worth ten that do not.
