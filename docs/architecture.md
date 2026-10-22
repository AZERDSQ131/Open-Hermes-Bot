# Architecture: the app and Hermes

Two pieces, one boundary. This page says where the boundary runs and what
each side is responsible for.

```
the person ──▶ this app (interface) ── port or tunnel ──▶ Hermes (harness)
                Electron + React                           the agent loop
                sidebar, bubbles,                          the memory
                avatars, group protocol                    the tools, the models
```

## Hermes' side

Hermes is the harness. It owns everything that makes an agent an agent.

- **The loop.** A turn goes to Hermes and comes back as events: text deltas
  and tool calls. The app never decides what the bot does next.
- **The memory.** A conversation is a session, and the session is the
  transcript. A bot that answers again next month answers with the same
  memory, because the memory never left the host.
- **The models.** The list of models a bot can use comes from Hermes, and so
  does the quota. The app picks one per bot; Hermes calls the provider.
- **The tools.** Hermes runs the tools. The app only shows that a tool ran.
- **The credentials.** The provider keys are Hermes' business. The app never
  sees them and cannot see them.
- **The profiles.** A bot is a profile: its own key, its own environment, its
  own sessions. The primary profile carries the app's own preferences.

## This app's side

The app is the interface. It owns the room the conversation happens in.

- **The shell.** The Electron window, the sidebar, the bubbles, the composer,
  the native macOS chrome.
- **The identity of a bot.** Its name, its colour and the face it wears are
  written into its own Hermes profile, so the bot survives a restart.
- **The group protocol.** Silence, tapbacks, mentions, waves, and the limits
  that stop a group from talking to itself. It is the one piece of
  conversation logic that lives in the app, and it lives in `src/group.ts`.
- **The pick of the model.** Which model a bot answers on, remembered per bot
  so the next conversation starts on the model that last answered, and the
  retry on a free model when the quota is spent.
- **The attachments and the dictation.** The file is copied to the server
  where the bot can read it, and the recording is transcribed by Hermes. The
  app records and sends; it does not transcribe.
- **The connection.** Where Hermes runs — this machine or another one — the
  API key in the macOS Keychain, and the reconnect. When Hermes is elsewhere,
  the app opens an SSH tunnel rather than ask the person's server to expose a
  port; when it is here, the app speaks to the API port itself.
- **The setup.** The first run asks where Hermes lives, for the key, and who
  answers on the other side — one question at a time. It reads the bots from
  the host like everything else, and it can be run again by hand.
- **The next version.** The app looks for its next version on the releases
  page, by itself on launch, or when the person asks for it from the face at
  the foot of the sidebar or from **Settings → Updates**. The rules of that live
  in `electron/updater.js`, and the words the person reads live in
  `src/updates.ts`. Neither of them talks to Hermes: the releases page is the
  app's own business. The history of what GitHub has published is asked by
  the shell, though — the renderer is not allowed to touch the network
  itself — and a row of that history opens only on a page of the project's
  own releases.
- **The connectors.** The services a bot can reach besides Hermes itself
  live on the host, behind the managed gateway. They are not on the API the
  app talks to: that API answers the agent's own questions. So the shell runs
  a script on the machine that runs Hermes, with the Python that runs Hermes
  — the system one is too old for its modules and has none of their
  dependencies, and the script is run through Hermes' own bootstrap, which is
  what leases them. The rules of that reading are in `src/connectors.ts`, and
  the marks of the services are the logos of the vendor, fetched by the shell
  and handed over as bytes: the window touches no network of its own.
- **The skills and the tools.** They live with a bot, on the host, and they
  are read and turned on and off the same way the connectors are. The app
  keeps nothing of them: it asks the host again every time.

## What the app does not keep

Nothing of the conversation. No file, no Keychain entry, no `localStorage`, no
cached transcript. The app can be closed, wiped or replaced, and the
conversation is still there, on the host that owns it.

The app keeps two things of its own, and they are about the app rather than
about the conversation: the **connection record** — where Hermes runs, the
host when it runs elsewhere, the ports, and the fact that the setup has been
walked through — and the **key**, in the Keychain, under the app's own
service.

The setup flag lives with the connection because the app has to know it
before Hermes is reachable: the first question the setup asks is where Hermes
runs. Everything the setup learns about the bots stays on the host.

The only secret on this machine is the Hermes API key, in the Keychain, under
the app's own service.

## Where to change what

- To change **which model answers**, or what the bot can do: Hermes.
- To change **who speaks next**, or how a group reads: this app, and only
  this app.
- To change **how the app reaches Hermes**: `electron/main.js` for the calls,
  with the rules of the two connections in `electron/connection.js` and the
  shape of the calls written down in `src/hermes.d.ts`.
- To change **what the first run asks**: `src/onboarding.tsx`, which owns the
  steps, the order and the voice.
- To change **how the app finds its next version**, or what it says about it:
  `electron/updater.js` for the rules, `src/updates.ts` for the words.
