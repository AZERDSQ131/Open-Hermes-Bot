# Changelog

The versions of Hermes Bot, and what each one changed. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **A page of connectors.** **Settings → Connectors** is where the services
  your bots can reach besides Hermes will be listed — a calendar, a place, a
  document. The page is empty for now: it is there before its content.

### Changed

- **The page of security.** `SECURITY.md` says now what the app holds — the
  key in the Keychain, the two files it writes on the disk, and nothing else
  — what it does with it, and what leaves the machine: the host you named,
  and two requests to GitHub that carry no token. It is plain about the
  limits as well: the build is signed with a development certificate and is
  not notarized.

- **The foot of the sidebar.** The settings and the update mark are one pill
  now. The round face on the left is the update button, and the app looks for
  its next version by itself: the face turns while it looks, a ring walks with
  the download, a dot pulses when a version was seen, and pings when the new
  version is on the disk. The name in the middle is the machine Hermes runs
  on, and it opens the settings. The marks on the right are the connectors,
  and they open their page.

### Fixed

- **A bot that was made is a bot you can see.** A link that dropped while
  the bot was being built was reported as the bot failing: the setup then
  asked for a name Hermes would refuse as already taken, and told the person
  to open the settings they were standing in. The app opens the link again,
  shows the bot it made, and says what is still missing — in one sentence,
  with one full stop.

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
