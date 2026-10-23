# Changelog

The versions of Hermes Bot, and what each one changed. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **The phone.** `mobile/` is the same interface one screen wide: an Expo app
  that lists the bots, reads a conversation back from the host, and sends a
  turn that streams as it is written. A phone cannot open an SSH tunnel, so
  it is paired with a small service on the Hermes host — `bridge/` — minted
  from a code and published to the tailnet by `tailscale serve`. The Hermes
  key never leaves the host; the phone keeps the bridge's address and a
  device token of its own, in the Keychain, and a device is revoked from the
  app. The model picker, the attachments, the dictation and the preferences
  are still the desktop's, and [docs/mobile.md](docs/mobile.md) says so.
- **The capabilities of the host.** **Settings → Connectors**, **→ Skills**
  and **→ Tools** are the three pages of what your bots can reach. The
  connectors are the services of Hermes itself — a notebook, a calendar, a
  map — with their real marks, and connected from the host: the app asks the
  host, the host mints the link, and the link opens in the browser. The
  skills and the tools are the host's own lists, turned on and off there.
  A service of the host's own catalogue is connected without a Nous account:
  the host installs it, the provider signs itself in through your browser,
  and the shell holds the port that comes back for as long as the flow runs.

### Fixed

- **The connectors that never finished loading.** The page asked the host
  once per page that wanted it — the dock at launch, the page when it opened,
  and twice more while a dev build settles — and each ask booted Python on the
  host. Three at once outlasted the timeout, so the page sat on "Reading the
  host…" while the host was asked the same question again. The read is now
  asked once and an answer from a moment ago is given again, the page stops
  saying it is reading when nothing answers, and a Keychain that asks a
  question can no longer hold every call to the host behind it.

### Changed

- **The marks of the connectors.** They are drawn from the vendor's own
  picture service, and the **shell** is the one that asks for them: the
  window still makes no network call of its own, and the content security
  policy needed no remote picture for it. The ask names the service it wants
  and nothing else — no token, no key, no host name — and the bytes come
  back as a picture the page may draw. When they do not come, the first
  letter of the name stands in.

- **The page of security.** `SECURITY.md` says now what the app holds — the
  key in the Keychain, the connection record, the installation id — what it
  does with it, what it does to the host when a bot is made, and what leaves
  the machine: the host you named, and GitHub, which gets the id of the copy
  and no more. It is plain about the limits as well, and about the two that
  matter most: the build published by the release workflow is not signed, and
  it is not notarized.

- **The foot of the sidebar.** The settings and the update mark are one pill
  now. The round face on the left is the update button, and the app looks
  for its next version by itself: the face is quiet while it looks, a ring
  walks with the download, a dot pulses when a version was seen, and pings
  when the new version is on the disk. The word in the middle is Settings,
  and it opens them. The marks on the right are the connectors of the host,
  and they open their page.

### Fixed

- **A bot that was made is a bot you can see.** A link that dropped while
  the bot was being built was reported as the bot failing: the setup then
  asked for a name Hermes would refuse as already taken, and told the person
  to open the settings they were standing in. The app opens the link again,
  shows the bot it made, and says what is still missing — in one sentence,
  with one full stop.
- **The wait is out of the click.** The setup held the person for twelve
  seconds, waiting for the gateway to serve a bot that Hermes only serves at
  its next scan. The bot is made, the app warms it up in the background — it
  asks the gateway again, and waits for it where the person is already
  waiting — and the last page says "Connecting to your machine…" until the
  door is open.
- **The bot of the setup is in the sidebar.** The bot the person made during
  the setup is carried by hand until the server lists it, instead of waiting
  for the list to catch up.

## [1.1.0] — 2026-10-22

### Added

- **An update, on a button.** **Settings → Updates** says which version the
  app is running, and one button looks for the next one. If there is one, it
  is downloaded in front of the person — the bar shows how far it has come —
  and the app restarts as the version that was found. The app still looks by
  itself on launch, quietly, and takes the update when it closes.
- **The mark beside the settings.** An icon in the sidebar, without a word:
  it turns while it looks, a ring walks with the download, a dot pulses when
  a version was seen, and pings when the new version is on the disk.
- **What GitHub has published.** **Settings → Updates** reads the page of the
  project too: the versions before this one, row by row, with their dates,
  and each row opens where its release lives. The shell asks GitHub — the
  screen touches no network of its own.
- **A setup, step by step.** The first time the app opens, it asks where
  Hermes lives, for the key that opens the door, and who answers on the other
  side. It shakes hands with the host, asks it for the first bot, and shows
  that bot on the last page. The setup can be run again from
  **Settings → Setup**, whenever Hermes moves to another machine.
- **An actor for the setup.** The setup is not a page of forms: it is a scene
  with one character in it, that breathes, blinks, thinks while the tunnel
  opens, and celebrates when the host answers.
- **An actor that changes its mind.** Every two seconds it takes another
  colour and another shape, and the light of the window takes the colour with
  it.
- **Hermes on this machine.** The app talks to a Hermes that runs on the same
  machine, on the API port itself: no SSH, no tunnel, no host to name. The
  setup and the settings ask first where Hermes runs — this Mac, or another
  machine reached by the tunnel as before — and the key is read from the
  Hermes home right here. A connection stored by an older version keeps
  meaning `ssh`.

### Changed

- **The connection is two panels, and each is a click.** The setup and the
  settings ask first where Hermes runs — this Mac, or another machine — as
  two panels side by side, with the question breathing on its own line
  above them. A Hermes on this Mac is scanned and connected with nothing
  to fill in; on another machine, the hosts the SSH config already names
  are listed, and one click reads the key from that machine, writes the
  connection down and opens the tunnel. When there is no key to read, the
  app asks for it where the key goes.
- **Nothing to fill in on this Mac.** The API key field and the button to
  read it are gone wherever Hermes runs here: the scan reads the key
  where it lives, says where it lives for the person whose Hermes insists
  on one (`~/.hermes/.env`), and only the way to take a stored key back
  remains. The field and the button stay for a Hermes elsewhere.
- **The chrome carries no violet.** A chosen panel or host in the
  settings wears light gray; the setup's glows, page timeline, checks
  and dots wear smoke and slate, and the light a new bot starts under is
  the palette's blue. The colour a bot wears keeps being its own.
- **The connection is one page.** Where Hermes lives, the key, and the
  handshake that says whether the two of them are talking: all three on the
  same page, tested by the button at the bottom.
- **The first bot is asked for, in three pages.** What is it called, what
  shape, what colour — one question at a time, and the actor is the bot while
  the bot is being made: it wears the shape that is being picked, and the
  colour. The bots the host already serves are not shown: an app that has
  just been installed has no agents, and the bot is not the point of the
  setup — there is a way to leave it for later.

### Fixed

- **An error the person can read.** A command that never ran has no stderr to
  read, and reading it anyway threw: the app answered with an exception
  instead of saying what went wrong. It shows up on a machine that has not been
  told where Hermes lives yet.
- **A check that failed in silence.** The app listened for the version it
  downloads, but not for the error of a check that went wrong: an error
  nobody listens to is thrown, and it took the app down with it. A machine
  without a network, or one whose releases page moved, now keeps the version
  it has.
- **The settings pane stops dragging the window.** Choosing the panel that
  shows more grew the content, and the scrollbar that followed dragged
  everything left as it came. The pane scrolls with the wheel; the bar is
  retired.

## [1.0.0] — 2026-10-21

The first release.

### Added

- **A window onto Hermes.** The app talks to a Hermes host over SSH, and
  draws the conversations it finds there. The bots, the groups and the
  conversations live on the host; the app keeps none of them.
- **Conversations that survive.** A conversation is read back from the server
  when it is opened, so closing the app, wiping it or reinstalling it costs
  nothing. The transcript, the identity of the bots and the models the person
  picked all live on the host.
- **Groups of bots.** Every member of a group is asked at the same time, and
  their answers stream side by side. A member that has nothing to say says so
  with a tapback instead of vanishing. A bot that names another hands it the
  floor, and stops it if it is still writing.
- **Files and voice.** A file you attach is copied to the server, where the
  bot can read it. The microphone dictates: Hermes transcribes the recording
  on your own host, and the words land in the composer.
- **A model picker.** The models the bot's providers offer, the ones to hide,
  the ones to pin, and the one each bot falls back to. When a model is out of
  quota, the turn retries on a free one and says so.
- **A release on GitHub.** A signed build of the app for macOS, published on
  the releases page, and an app that finds its own next version there.
