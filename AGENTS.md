# Working on Hermes Bot

This file is the map for whoever works on the app — a person, or an agent.
`CONTRIBUTING.md` is the contract (the commands, the conventions, the
release); this one is the orientation: where the boundaries are, what must
not break, and the traps.

## The one rule

**The app is an interface; Hermes is the harness.** The app draws the
conversations and carries the turns; Hermes runs the agents, holds the
memory, calls the models and keeps what the person chose. A conversation, a
bot's face, a model pick — all of it belongs to the host.

Before adding a piece of state to the app, ask where it should live. The
answer is almost always "on the host, in the bot's own profile". There is a
test that says the `localStorage` stays empty; do not make it a place to
shelve something.

## The commands

```bash
npm run dev              # the app, with hot reload
npm run build            # typecheck + production renderer build
npm test                 # the tests
npm run test:coverage    # the tests, and the coverage thresholds
npm run dist             # the .app and the .dmg, in release/
```

Node 24. A Hermes host to talk to; without one the app says it cannot reach
it, which is the normal state of a fresh install.

## The map

| Path | What lives there |
|---|---|
| `electron/main.js` | the shell, and every call to Hermes (SSH, tunnel, sessions, files, voice) |
| `electron/preload.js` | the only bridge the renderer is allowed to use |
| `electron/updater.js` | the rules of the update: what is looked for, and what happens to it |
| `src/App.tsx` | the window: sidebar, conversation, composer, groups |
| `src/components/` | the faces, the dialogs, the pickers, the panels |
| `src/onboarding.tsx` | the setup: the first run, step by step |
| `src/moods.ts` | the theatres of state, ported from dsh-bloub-mood: the scores, and what a thread or an update reads as |
| `src/components/MoodBloub.tsx` | the actor that walks a mood around the clock, and dozes with the quiet |
| `src/group.ts` | the protocol of a group: silence, tapbacks, mentions, waves |
| `src/conversations.ts` | reading a conversation back out of the sessions |
| `src/turns.ts` | the rules of a turn: tapbacks, quota, a server still installing |
| `src/updates.ts` | what an update means, in words |
| `src/components/UpdateButton.tsx` | the next version, in the round face at the foot of the sidebar |
| `src/connectors.ts` | the connectors of the host: how they are read, and how they are named |
| `src/modelPrefs.tsx` | what the person chose, and where it is kept |
| `src/recording.ts` | the microphone, and the bytes it produces |
| `docs/` | how the app is put together — read these before changing it |
| `site/` | the page that presents the project |

`docs/architecture.md` says where the boundary runs, `docs/transport.md` says
what the app asks Hermes, and `docs/vocabulary.md` says what the words mean
here. The words matter: the app, the harness, a session, a group, a wave, a
tapback, a silence.

## What must not break

- **The coverage gate.** The rules of a conversation are covered to the line
  and the build fails if one of them stops being exercised
  (`vitest.config.ts`). A change that lowers the coverage fails the CI
  before it fails the person.
- **The content security policy** (`vite.config.mts`). No inline script, no
  remote anything. The dev server has its own policy; the built app has the
  strict one. If you need a new kind of resource, say why in the policy
  rather than loosening it.
- **The empty `localStorage`.** The conversations, the faces and the
  preferences are on the host. The app's own record — the host, the ports and
  the fact that the setup was walked through — is the one thing it keeps.
- **The name.** `Hermes Bot` everywhere: the window, the bundle, the
  prompts the models read, the settings, the Keychain service. A rename is
  a rename everywhere, with the old names read once as a fallback.

## The traps

- **`ELECTRON_RUN_AS_NODE` in your shell.** If it is set, `electron .` does not
  run the app: it runs Node, the main script never starts, and the process
  exits with no message at all. `env -u ELECTRON_RUN_AS_NODE electron .`
  when the app seems to die silently.
- **`electron/main.js` is plain JavaScript**, 2000 lines, and nothing checks
  it. It carries the SSH, the tunnel, the SSE stream and the shell scripts it
  runs on the host. A mistake there is silent.
- **The paths inside the bundle.** `__dirname` is inside `app.asar` in a
  packaged app. A path that reaches outside the bundle (`../build/icon.png`)
  has to be *in* the bundle: `build/**` is in the `files` list of
  `package.json` for that reason.
- **The group is not a Hermes object.** It is rebuilt from the titles of its
  members' sessions (`Group · <group> · <member>`). Change the convention
  and you lose every group on every host.
- **An update needs room and a signature.** The update is downloaded and
  unpacked on the machine: a disk with a gigabyte free fails it for a reason
  that has nothing to do with the update. The app is signed with a
  development identity, and Squirrel.Mac checks the signature of what it
  installs against the one of the app that is running.
- **A conversation is read back from the server**, not kept. A test that
  passes locally against a cached transcript is not a test.
- **The Mac is where the app is built.** The CI runs the checks on Linux
  (faster, and they say the same thing); the release workflow builds on
  macOS.
