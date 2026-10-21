# Grok Bot

A macOS Electron clone of the multi-agent chat interface: dark sidebar, Bloub agent
avatars, cream user bubbles and a floating composer.

It talks to a **Hermes host** — the agent runtime on your own machines — over SSH.
The bots, the groups and the conversations live there, not on this machine.

MIT licensed — see [LICENSE](LICENSE).

## What this is

This app is an **interface for Hermes**. It is not a harness.

Hermes is the harness: it runs the agent loop, keeps the memory, owns the
conversations, executes the tools and calls the models. This app is the macOS
shell in front of that — the sidebar, the avatars, the bubbles, the composer,
and the rules that decide which bot answers next.

So the app runs no model and keeps no transcript: the conversation lives on the
Hermes host, and closing the app, wiping the disk or moving to another machine
changes nothing about it. The only secret on this machine is the Hermes API
key, in the login Keychain.

What the app owns is the room: the identity of the bots, the group protocol,
and the way a turn reads.

The split is written down in [docs/architecture.md](docs/architecture.md), how
the app reaches Hermes in [docs/transport.md](docs/transport.md), and the words
we use for all of it in [docs/vocabulary.md](docs/vocabulary.md).

## Install

Grab the `.dmg` from the [releases](https://github.com/AZERDSQ131/Open-Grok-Bot/releases),
drag **Grok Bot** into *Applications*, and open it.

The app is not signed with a Developer ID, so macOS greets it like it greets any
program it has never seen: *“Grok Bot cannot be opened because the developer
cannot be verified.”* Open it with a right click → **Open** → **Open**, once. From
then on it opens like any other app. (Or from a terminal:
`xattr -dr com.apple.quarantine "/Applications/Grok Bot.app"`.)

### First run

The app needs two things, both in **Settings**:

- **the SSH host** of the machine running Hermes — the name your `~/.ssh/config`
  already uses, e.g. `jetson`;
- **the API key** of that host. Press *Import from \<host\>* and the app reads
  `API_SERVER_KEY` from the host's `~/.hermes/.env` over the SSH it already
  uses. The key stays in the login Keychain, under the app's own entry.

Then press **Connect**. The app opens a tunnel to the host, asks it which bots
exist, and shows them. Nothing else is needed: no account, no cloud, no key
typed by hand.

## Run it from the sources

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and opens the Electron window with native macOS traffic
lights and a hidden inset title bar.

```bash
npm run build   # typecheck + production renderer build
npm start       # build, then launch the production app
npm test        # the protocol and the transcript reader
npm run test:coverage   # the same, with the coverage
```

Every push runs the typecheck, the tests and the build on GitHub Actions
(`.github/workflows/ci.yml`): the app is macOS, so the check runs on macOS.
The coverage is a gate too: the rules of a conversation — the protocol, the
transcript reader, the preferences, the recorder, the turns — are fully
covered, and the build fails if a line of them stops being exercised.

## Build a release

```bash
npm run dist
```

`electron-builder` writes a `release/` folder with:

| Artefact | What it is |
|---|---|
| `Grok Bot-1.0.0-arm64.dmg` | the disk image to hand out |
| `Grok Bot-1.0.0-arm64-mac.zip` | the same app, zipped (what the auto-update fetches) |
| `*.blockmap`, `latest-mac.yml` | what `electron-updater` needs to find a new version |

The build is signed with whatever identity is in the keychain, and notarization
is skipped when there is no Developer ID to notarize with. A build made without
a Developer ID works on the machine that made it, and on the machines of the
people who accept the “Open” dance above.

## Publish it on GitHub

A **GitHub Release** is a version of the app with a name, a note and the files
attached to it. It is a page on the repository: `github.com/AZERDSQ131/Open-Grok-Bot/releases`,
one entry per version, with the `.dmg` and the `.zip` attached. Whoever has the
link opens the page, downloads the `.dmg`, drags the app into *Applications*.
The releases are also what `electron-updater` watches, so an installed app can
find the next version by itself.

To publish one by hand:

```bash
gh release create v1.0.0 \
  "release/Grok Bot-1.0.0-arm64.dmg" \
  "release/Grok Bot-1.0.0-arm64-mac.zip" \
  --title "Grok Bot 1.0.0" \
  --notes "First release."
```

A tag on `main` is what marks the version: `git tag v1.0.0 && git push --tags`.

## Structure

```
docs/                   Architecture, transport and the words this project uses
electron/main.js        Electron shell, window chrome, dock icon, Hermes bridge
src/App.tsx             Sidebar, chat, composer and interactions
src/components/         Bloub avatars, create dialog, logo editor, icons
src/conversations.ts    Reading a conversation back out of the Hermes sessions
src/data.ts             Threads, group members, messages and reactions
src/group.ts            Group protocol: silence, tapbacks, @mentions, turns
src/turns.ts            The rules of a turn: tapbacks, quota, a server installing
src/styles.css          Design system and layout
build/                  App icon (.icns + .png) and icon source
```

The `+` button creates either a bot (with its own Bloub shape and color) or a group
of existing bots. In the header, click the name to rename the agent, or the logo to
change its shape and color — for a group, each member is styled from its own tab.

Chat is real once the app is connected to a Hermes host (Settings → API key): the
first message in a conversation opens a Hermes session for that bot, and every turn
is streamed back into an assistant bubble, so the bot keeps the thread's memory.
The model chip in the composer lists the models the bot's providers offer and sends
the picked one with each turn; “Bot default” leaves the choice to Hermes. A pick is
remembered per bot, so the next conversation starts on the model that last answered
rather than on one that just ran out of quota. When the configured model does run
out — or a model picked by hand does — the turn retries on a free model from the
same provider and says so in the thread instead of dying on a dead end. The pick
is only made the bot's default when the turn was running on “Bot default”. A turn that stops producing events — a
refused key, an exhausted quota — ends with a readable line in the conversation
instead of a spinner that never stops.

Conversations survive a restart: reopening a thread recreates its session by title,
and if Hermes already has a session under that title the app resumes it instead of
failing with “Title already in use”.

A file the person attaches is copied to the server, where the bot can read it: the
app sends it over the SSH it already uses, and the message carries its path. The
microphone dictates: the app records what the person says and Hermes transcribes
it on the server — the browser's own speech service is not used, because the key
Chromium carries for it is refused by the service, which looks exactly like a
broken connection. The words land in the composer, where the person can read them
before sending.

The dictation needs a transcription backend on the Hermes host: `faster-whisper`
for a local and free one, or a cloud provider key.

## Where a conversation lives

A conversation is a Hermes session, and Hermes is the only place it is kept. The app
writes its turns there and reads them back: on start it asks the gateway which
conversations each bot holds, and opening one reads its transcript from the server.
Nothing about a conversation is written on this machine — no file, no keychain, no
`localStorage` — so the app can be closed, wiped or replaced and the conversation is
still there, on the host that owns it.

That is the boundary: Hermes is the harness — it decides what the bot does next,
calls the model and runs the tools — and this app is the interface, which writes
the turn, draws what comes back, and keeps the room the bots share. Neither one
holds the other's work.

A group is not a Hermes object, so it is rebuilt from the titles of its members’
conversations: a private conversation carries the bot's name, a group member’s
carries `Group · <group> · <member>`. Renaming a bot or a group renames those
sessions on the server, so the link between a thread and its conversation never
breaks.

The identity of a bot travels the same way: its name, its colour and the face it
wears are written into the bot’s own Hermes profile, next to the metadata Hermes
already paints it with. A bot that comes back after a restart is the same bot.

## Group conversations

A group is not one bot answering for everybody. Each member answers through its
own Hermes profile and its own session, so the same bot, with the same memory,
shows up in the group and in its private thread.

- **Silence is a move, and it always leaves a tapback.** Members reply with
  `[[silent]]` when a line is not for them or when someone else already covered
  it. The app enforces the acknowledgement: a silent member gets an emoji
  reaction chosen in code, so “no reply” never means “vanished”. When you
  (or another bot) addressed them by name, a small “*Name* stayed silent” note
  says the turn was seen.
- **Tapbacks** work as in a private thread (`[[react:🔥]]`). In a group the
  reaction is signed, so two bots can tap the same message.
- **A tapback says who tapped.** The reaction shows as a pill under the
  message, and clicking it opens the bots that left it, and with what.
- **@mentions** hand the floor over: a bot that writes `@Name` gives that member
  the next wave, and a member can answer back. If the mentioned bot is still
  generating, its request is cancelled on the spot — it does not talk over the
  mention — and it answers again next wave with the mention in its transcript.
  A round stops after eight spoken lines and no member speaks more than twice,
  so the group cannot talk itself into a loop.
- **Every member is asked at the same time.** One message makes one request per
  bot in parallel, and their answers stream side by side. Members named in the
  message are told they were addressed; the rest decide on their own whether to
  chime in or stay silent. A later wave only includes the bots mentioned by the
  previous one, also in parallel.
- Type `@` in the composer to pick a member. Each member uses its own model
  default — the group has no model picker of its own.

## Credits

The avatar geometry comes from [Bloub](https://github.com/jeremy-prt/bloub) by
Jérémy Perret (MIT). The generated frames are in
`src/components/bloubFrames.ts`; see `THIRD_PARTY_NOTICES.md`.
