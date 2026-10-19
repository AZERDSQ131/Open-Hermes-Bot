# Sidekick

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
```

## Structure

```
electron/main.js        Electron shell, window chrome, dock icon
src/App.tsx             Sidebar, chat, composer and interactions
src/components/         Bloub avatars, create dialog, logo editor, icons
src/data.ts             Demo agents and transcripts
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
out, the first turn retries on a free model from the same provider and says so in
the thread instead of dying on a dead end. A turn that stops producing events — a
refused key, an exhausted quota — ends with a readable line in the conversation
instead of a spinner that never stops.

Conversations survive a restart: reopening a thread recreates its session by title,
and if Hermes already has a session under that title the app resumes it instead of
failing with “Title already in use”.

## Credits

The avatar geometry comes from [Bloub](https://github.com/jeremy-prt/bloub) by
Jérémy Perret (MIT). The generated frames are in
`src/components/bloubFrames.ts`; see `THIRD_PARTY_NOTICES.md`.
