# Grok Bot

A macOS Electron clone of the multi-agent chat interface: dark sidebar, Bloub agent
avatars, cream user bubbles and a floating composer.

## Run it

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
```

## Structure

```
electron/main.js        Electron shell, window chrome, dock icon, Hermes bridge
src/App.tsx             Sidebar, chat, composer and interactions
src/components/         Bloub avatars, create dialog, logo editor, icons
src/conversations.ts    Reading a conversation back out of the Hermes sessions
src/data.ts             Threads, group members, messages and reactions
src/group.ts            Group protocol: silence, tapbacks, @mentions, turns
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

## Where a conversation lives

A conversation is a Hermes session, and Hermes is the only place it is kept. The app
writes its turns there and reads them back: on start it asks the gateway which
conversations each bot holds, and opening one reads its transcript from the server.
Nothing about a conversation is written on this machine — no file, no keychain, no
`localStorage` — so the app can be closed, wiped or replaced and the conversation is
still there, on the host that owns it.

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
  it. The app enforces the acknowledgement: a silent member gets a bubble-sized
  emoji reaction chosen in code, so “no reply” never means “vanished”. When you
  (or another bot) addressed them by name, a small “*Name* stayed silent” note
  says the turn was seen.
- **Tapbacks** work as in a private thread (`[[react:🔥]]`). In a group the
  reaction is signed, so two bots can tap the same message.
- **The person can react too.** A right click on a message — or the little
  smiley that shows up when the pointer is over it — opens a panel of big
  emoji to answer with. The reaction shows as a pill under the message, lit
  when it is yours, and picking the same emoji again takes it back.
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
