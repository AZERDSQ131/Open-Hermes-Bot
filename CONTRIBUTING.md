# Contributing

Hermes Bot is a window onto [Hermes](https://github.com/AZERDSQ131) — the
harness that runs your agents. The app draws the conversations; Hermes decides
what happens in them. [docs/vocabulary.md](docs/vocabulary.md) says what that
sentence means, and the rest of this file says how to work on the app.

**The one rule that shapes everything else: the app keeps nothing.** A
conversation, a bot's face, a model the person picked — all of it belongs to
Hermes, on the machine that runs it. If you add something that belongs to the
person, ask first whether Hermes could keep it instead.

## Getting set up

You need Node 24 and a Hermes host to talk to.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and opens the Electron window. The app looks for
Hermes on the host named in **Settings**; without one it will tell you it
cannot reach it, which is the expected state of a fresh install.

The day-to-day commands:

| Command | What it does |
|---|---|
| `npm run dev` | the app, with hot reload |
| `npm run build` | the typecheck and the production renderer build |
| `npm test` | the tests |
| `npm run test:coverage` | the tests, with the coverage — and the thresholds |
| `npm run test:update` | the update, for real: two builds, a feed, a button |
| `npm run dist` | the `.app` and the `.dmg`, in `release/` |
| `npm start` | the built app, without packaging it |

The phone's door is a separate service, in `bridge/`, with its own suite:
`cd bridge && python3 -m unittest discover -s tests`. The phone itself lives in
`mobile/`, an Expo app whose gate is `cd mobile && npx tsc --noEmit`.

## Where things live

```
electron/main.js        the shell and the bridge to Hermes
electron/updater.js     the rules of the update: what is looked for, and what happens to it
src/App.tsx             the window: sidebar, conversation, composer
src/components/         the faces, the dialogs, the pickers
src/onboarding.tsx      the setup: the first run, step by step
src/group.ts            the protocol of a group: silence, tapbacks, mentions
src/conversations.ts    reading a conversation back out of the sessions
src/turns.ts            the rules of a turn: tapbacks, quota, a server installing
src/modelPrefs.tsx      what the person chose, and where it is kept
src/recording.ts        the microphone, and the bytes it produces
src/updates.ts          what an update means, in words
bridge/                 the door a phone uses: loopback only, published by tailscale serve
mobile/                 the phone: Expo, the same screens, Hermes once paired
electron/preload.js     the bridge the renderer is allowed to use
docs/                   how the app is put together
site/                   the page that presents the project
```

Three pages of `docs/` are worth reading before you touch anything:
[architecture](docs/architecture.md) says where the boundary runs,
[transport](docs/transport.md) says what the app asks Hermes and why, and
[vocabulary](docs/vocabulary.md) says what the words mean here.

## The tests, and the coverage that guards them

The rules of a conversation — the protocol, the transcript reader, the
preferences, the recorder, the turns — are covered **to the line**, and the
build fails if one of them stops being exercised. That threshold lives in
`vitest.config.ts`; it is a floor, not a goal.

The app itself (`src/App.tsx`) is covered by integration tests that drive it
the way a person does: `src/App.test.tsx` sends a message, renames a bot,
runs a round in a group and checks what the server was told.

When you change a rule, change its test in the same commit. When you find a
bug, write the test that catches it *before* the fix — the bugs this project
has had were all found that way.

## How to write a change

- **One thing per commit.** The message says what changed and why, in the
  imperative, in English, and the body explains the reason when the reason is
  not obvious. `Fix the group that could not be renamed.` not `fix group`.
- **The subject line is the change.** A reader skimming `git log` should be
  able to tell what the branch does.
- **Branches are named after the work**: `fix/mention-interrupts`, `feat/dictation`.
- **A pull request explains the why.** The diff already says the what. Say
  what you were trying to do, what you did, and what you did not do.

## Working with more than one agent

Two agents in one checkout step on each other: one writes to
`src/styles.css` while the other reads it, and the conflict shows up at the
merge instead of at the start.

**One agent, one worktree.** A worktree is a second checkout of the same
repository — the same history, a separate copy of the files on the disk. Two
agents in two worktrees cannot touch the same file, so the conflict has
nowhere to happen. The [page on working together](docs/working-together.md)
says how to set one up, with T3 and without, what to do when two agents want
the same file, and how the branch, the pull request and the version fit
together.

## Releasing

A version is a tag on `main`, and the tag is what publishes it.

```bash
# 1. the version in package.json, and the changelog
npm version 1.1.0 --no-git-tag-version

# 2. the commit, and the tag
git add package.json package-lock.json CHANGELOG.md
git commit -m "Prepare 1.1.0"
git tag -a v1.1.0 -m "Hermes Bot 1.1.0"
git push origin main --follow-tags
```

The tag starts `.github/workflows/release.yml`: macOS builds the app, the tests
run, and the `.dmg`, the `.zip` and the block maps are attached to the GitHub
Release the tag created. **The release is created as a draft** — open it, write
the notes, and publish it:

```bash
gh release edit v1.1.0 --draft=false --title "Hermes Bot 1.1.0" --notes "…"
```

An installed app finds the new version by itself: it looks at the releases
page, downloads the build in the background and takes over when the person
closes the app.

If the tag is on the wrong commit, delete it and tag again
(`git tag -d v1.1.0 && git push origin :refs/tags/v1.1.0`) before anything
was published.

## The things that will bite you

- **The renderer keeps nothing.** `localStorage` is empty on purpose, and the
  tests say so. A preference belongs to Hermes, with the bot it is about.
- **One fact the app keeps.** Whether the setup has been walked through lives
  in the app's own record, next to the connection: the app has to know it
  before Hermes is reachable. Everything else the setup learns stays on the
  host.
- **The content security policy is strict** (`vite.config.mts`): no inline
  script, no remote anything. If you need a new kind of resource, say why in
  the policy rather than loosening it.
- **The app talks to one harness.** Hermes' own API, not a general agent
  protocol. Swapping the harness is not a configuration change here.
- **The transcript is read back from the server**, and a group is rebuilt from
  the titles of its members' sessions. Change one and you change the other —
  `src/conversations.ts` is where both live.
- **The name is `Hermes Bot`**, everywhere: the window, the bundle, the
  prompts the models read, the settings. If you rename something, rename it
  everywhere.
