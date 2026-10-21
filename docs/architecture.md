# Architecture: the app and Hermes

Two pieces, one boundary. This page says where the boundary runs and what
each side is responsible for.

```
the person ──▶ this app (interface) ── SSH tunnel ──▶ Hermes (harness)
                Electron + React                       the agent loop
                sidebar, bubbles,                      the memory
                avatars, group protocol                the tools, the models
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
- **The connection.** The SSH tunnel to the host, the API key in the macOS
  Keychain, and the reconnect. The tunnel exists so the app never has to ask
  the person's server to expose a port.

## What the app does not keep

Nothing of the conversation. No file, no Keychain entry, no `localStorage`, no
cached transcript. The app can be closed, wiped or replaced, and the
conversation is still there, on the host that owns it.

The only secret on this machine is the Hermes API key, in the Keychain, under
the app's own service.

## Where to change what

- To change **which model answers**, or what the bot can do: Hermes.
- To change **who speaks next**, or how a group reads: this app, and only
  this app.
- To change **how the app reaches Hermes**: `electron/main.js`, with the
  shape of the calls written down in `src/hermes.d.ts`.
