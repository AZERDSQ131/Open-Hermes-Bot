# Hermes Bridge

The door between a phone and Hermes.

Hermes already has everything the mobile app shows: the profiles that are
bots, the sessions that are conversations, the transcripts, the models and the
preferences. What it does not have is a way for a phone to reach them without
carrying the keys of every profile. The bridge is that way.

It runs on the machine that runs Hermes, answers on **loopback only**, and is
published to the tailnet by `tailscale serve`, which terminates HTTPS. A phone
that is on the tailnet can then talk to it, and nothing else can.

It keeps no conversations. The transcripts, the bots and the preferences are
Hermes' — the bridge is a pass-through that reads a key when it needs one and
never puts it in an answer.

## What it exposes

Every call is JSON. Authenticated calls carry `Authorization: Bearer <device
token>`, minted by pairing. A failure is `{"error": {"code", "message"}}`; a
turn is `text/event-stream`.

| Call | What it does |
| --- | --- |
| `GET /v1/health` | Public. Is the bridge up, is Hermes answering, is pairing needed. |
| `POST /v1/pair` | Public. Exchange a pairing code for a device token. Once per code. |
| `GET /v1/bots` | The bots: the primary profile, then every profile on disk. |
| `POST /v1/bots` | Make a bot. It lays out a real Hermes profile, with a key of its own. |
| `PATCH /v1/bots/<bot>` | Rename, recolour, reshape, describe. Writes the desktop app's metadata. |
| `DELETE /v1/bots/<bot>` | Take a bot out of service: the gateway stops serving it, a tombstone stays, the bytes go to trash. |
| `GET /v1/models?bot=` | The models that bot's authenticated providers offer. |
| `GET /v1/sessions?bot=` | Conversations, newest first. Without `bot`, from every bot. |
| `POST /v1/sessions` | Open a conversation `{bot, title}`. A taken title gets a suffix. |
| `GET /v1/sessions/<bot>/<id>/messages` | The transcript, oldest first. |
| `PATCH /v1/sessions/<bot>/<id>` | Rename a conversation. |
| `DELETE /v1/sessions/<bot>/<id>` | Delete a conversation. |
| `POST /v1/sessions/<bot>/<id>/turns` | One turn, as SSE: `delta`, `tool`, `done`, `error`. |
| `POST /v1/attachments?filename=` | The raw bytes of a file; it lands in `~/.hermes/attachments`. |
| `POST /v1/voice` | A recording, transcribed by Hermes' own python. The host needs an STT provider; without one Hermes says which, and the bridge passes that sentence on. |
| `GET` / `PUT /v1/prefs` | The app preferences, in the primary profile's `ui_meta.hermes-bot`. |
| `GET /v1/devices` | The paired devices. `DELETE /v1/devices/<id>` revokes one. |

`<bot>` is `default` for the primary profile, or a profile name. A turn's SSE
frames carry `{"text"}` for a delta, `{"tool"}` for a tool call, and
`{"text", "sessionId"}` for the end. Closing the stream is how the phone stops
a run: the bridge closes the upstream, and Hermes interrupts.

## The bots are profiles

Nothing about the bots is invented here. A bot is a directory under
`~/.hermes/profiles`, with the files that make it one, and its name, colour and
shape are `ui_meta.hermes-bots` in its `profile.yaml` — the block the desktop
app reads, so both apps draw the same bot. A new bot is laid out in a staging
sibling and published with one rename; it mints its own `API_SERVER_KEY` and
inherits neither the messaging tokens nor the primary's key.

A group is not a Hermes object, here as everywhere else: it is rebuilt from the
titles of its members' sessions (`Group · <group> · <member>`).

## Install

On the machine that runs Hermes (Python 3.11+, PyYAML):

```bash
./bridge/deploy/install.sh
```

Then publish it — this is the only thing that makes it reachable, and it opens
no port:

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8765
```

`https://<machine>.<tailnet>.ts.net/v1/health` is now the address the app
uses. Check it from another machine on the tailnet.

Pair the phone:

```bash
cd ~/hermes-bridge && python3 -m hermes_bridge pair
```

The code is valid for 20 minutes and works once. The service prints a code by
itself at its first start, before any device is paired.

When the service starts, it reads `~/.hermes-bridge/config.json` if it exists,
then the environment (`HERMES_BRIDGE_HOST`, `HERMES_BRIDGE_PORT`,
`HERMES_BRIDGE_HERMES_URL`, `HERMES_HOME`, `HERMES_BRIDGE_HOME`). The defaults
are `127.0.0.1:8765` and `http://127.0.0.1:8642`.

### Hermes must be answering

The bridge speaks to the API server the desktop app speaks to. It is part of
the Hermes gateway and needs a key in the primary profile's `.env`:

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<64 hex characters>
```

Each bot profile has its own key already; a bot without one answers `no_key`
until it gets one. The gateway must be running (`hermes gateway status`).

## What it refuses to do

- **Listen anywhere but loopback.** The bind address is a setting, not an
  invitation: publishing is `tailscale serve`'s job, and it authenticates the
  tailnet for us.
- **Hand out a Hermes key.** The device token opens this bridge and nothing
  else. Revoking it leaves the keys where they were.
- **Keep a conversation.** Messages are read from Hermes and streamed through;
  a restart of the bridge loses nothing but the devices' connections.
- **Take an unbounded body.** 25 MB per file, 2 MB per JSON call.
- **Trust a title or a colour.** Names are validated against Hermes' own rules;
  colours must be something a browser can paint.

## Tests

```bash
cd bridge && python3 -m unittest discover -s tests
```

The suite runs the bridge against a fake Hermes that checks each profile's
key, records the turn it was asked for, and streams frames back.
