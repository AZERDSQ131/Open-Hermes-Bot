# Hermes Bot — mobile

The screens of `mockups/mobile.html`, as an Expo app. It opens on the sample
the mockup draws; pair it with the bridge and the bots, the conversations and
the transcripts come from Hermes. Nothing said here is kept on the phone: what
survives a restart is the bridge's address and this phone's token, in the
Keychain.

## Connect it

The bridge runs on the machine that runs Hermes (`bridge/`), published on the
tailnet by `tailscale serve`. The phone must be on the same tailnet.

1. Put Tailscale on, on the phone.
2. On the host, mint a code: `cd ~/hermes-bridge && python3 -m hermes_bridge pair`.
3. In the app: **Settings → Connection**, type the address
   (`https://<host>.<tailnet>.ts.net`), the code, and pair.

From then on the chat list is Hermes': one thread per bot, its newest session,
read back from the host. A message sent there is a real turn, streamed as it
is written. Disconnecting puts the sample back.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on an iPhone, or press `i` for the iOS
simulator. Nothing else is needed: every dependency is one Expo Go already
carries (`react-native-svg`, `react-native-screens`,
`react-native-safe-area-context`, `expo-clipboard`, React Navigation).

`npx expo start --web` opens the same app in a browser; it is the quickest way
to look at a screen without a phone, and the only native things it loses are
the status bar and the keyboard behaviour.

## What is there

| Screen | Where |
|---|---|
| Conversations — pinned faces, recent threads, search | `src/screens/ConversationsScreen.tsx` |
| A conversation — bubbles, tapbacks, typing, composer | `src/screens/ChatScreen.tsx` |
| A group — three faces, authors, the mention roster | same file, `thread.kind === 'group'` |
| New agent — bot or group, shape, colour, model | `src/screens/NewAgentSheet.tsx` |
| Models — grouped, per conversation | `src/components/ModelList.tsx` |
| Group details — members, sessions, switches | `src/screens/GroupDetailsSheet.tsx` |
| Dictation — the recorder and its waveform | `src/components/Composer.tsx` |
| Settings — behind the gear at the top of the list | `src/screens/SettingsScreen.tsx` |
| First run — no bots yet | `src/components/FirstRun.tsx` |

The faces are the app's own geometry: `src/bloubFrames.ts` is copied from the
desktop window's `src/components/bloubFrames.ts` (Bloub by Jérémy Perret, MIT)
and drawn with `react-native-svg`. Nothing redraws a Bloub by hand.

The palette and the measurements come from `mockups/mobile.css`
(`src/theme.ts`); the copy comes from `mockups/mobile.html` (`src/data.ts`).

## What answers

Every control is wired, and every answer is local:

- **Conversations** — search filters the rows; a sideways push opens an
  action behind the row (pin or unpin one way, read or unread the other), and
  a long press opens the menu: pin, mark read or unread, open, delete (with a
  confirmation). The plus creates a bot or a group and opens it; the gear
  opens the settings. A rightward swipe goes back from any page.
- **A conversation** — send a message, attach a canned file or photo, dictate
  a voice note, type `@` to open the round's roster, long-press a bubble to
  tapback, copy or delete. The dots open the details: model, sessions, pin,
  tapbacks, notifications, clear, delete.
- **A group** — its sheet lists the members (a tap removes one), the model,
  the switches, and leaving the group.
- **A bot** — its face at the top of the conversation opens it: rename it,
  change its shape and colour, save, delete it (with a confirmation).
- **Settings** — every row opens its page: connection (the bridge's address,
  the pairing code, the paired devices, disconnect), models (the default),
  voice (host or device), updates (simulated check, automatic download),
  appearance (dark only, the haptics note), setup (connect, name a bot, done).
- **The first run** — with no bot left, the chat list shows screen 09, and
  its button creates the first one.

Once paired, what is kept on the phone is only the bridge's address and the
device token (`src/api.ts`, `src/store.tsx`). The sample comes back when the
phone is disconnected.

## What is not there yet

- **The model picker** still lists the sample's models. A turn runs on the
  host's current model, which the bridge resolves on `/v1/models`.
- **Attachments and dictation** are still the mockup's: the sheet hands over a
  canned file, and the recorder never uploads. The bridge takes the bytes
  (`/v1/attachments`, `/v1/voice`); the app does not send them yet.
- **Groups** are the app's own: Hermes rebuilds them from session titles
  (`Group · <group> · <member>`), which this client does not create yet.
- **The preferences** are in memory. The bridge keeps them on the host
  (`/v1/prefs`), and the app does not read or write them yet.
