# Transport: how the app talks to Hermes

Two channels: the Hermes API for the conversation, and plain commands on the
machine that runs Hermes for the few things the API does not expose. One fact
decides how they are reached — where Hermes runs. On this machine the app
speaks to the API port itself and runs the commands here, with the same
scripts it would have run over SSH. On another machine, both channels go
through an SSH tunnel.

## Where Hermes runs

The connection record says it: `mode` is `local` when Hermes runs on the same
machine as the app, `ssh` when it runs somewhere else. A record that predates
the mode — a host written down with no mode — is read as `ssh`, and an empty
record defaults to `local`. The rules that read it live in
`electron/connection.js`, and they are tested to the line.

## The tunnel, when Hermes is elsewhere

This is the `ssh` mode. The app opens a local forward and speaks to the API
as if it were local:

```
ssh -N -L 127.0.0.1:<localPort>:<host>:<apiPort>
```

The defaults are Hermes' own: `8642` on the host, `18742` locally. Nothing
new is exposed on the server, and the key never leaves the app.

A request that needs Hermes and finds no tunnel tries to connect first: the
person did not ask to be offline, they only opened the app. An explicit
disconnect keeps it offline, and keeps it that way until the person asks for
the connection again.

In `local` mode there is no tunnel to open and none to miss.

## The API

Everything rides `http://127.0.0.1:<localPort>` in `ssh` mode and
`http://127.0.0.1:<apiPort>` in `local` mode, under the prefix of the
profile the call is about — `/p/<profile>` — so a bot's turn is served by that
bot's own gateway and checked against that bot's own key.

| Call | What it does |
| --- | --- |
| `GET /health/detailed` | The connection test: a throwaway tunnel in `ssh` mode, the port itself in `local`. |
| `GET /api/sessions` | The conversations a bot holds. |
| `POST /api/sessions` | Opens a conversation. |
| `GET /api/sessions/<id>/messages` | The transcript, oldest first. |
| `PATCH /api/sessions/<id>` | Renames a conversation. |
| `DELETE /api/sessions/<id>` | Deletes a conversation, and its transcript. |
| `GET /api/sessions/<id>/chat/stream` | A turn, as a stream of text deltas and tool calls. |
| `GET /api/model/options` | The models the bot's providers offer. |

A profile mints its own `API_SERVER_KEY` when it is created, and the gateway
checks `/p/<name>/` against that key: a bot's turn cannot ride the primary
profile's key. The app reads that key from
`$HOME/.hermes/profiles/<profile>/.env` — through the SSH connection it
already has in `ssh` mode, straight off the disk in `local` mode — and keeps
it for the session.

## The host commands

Some of what the app needs is not on the API, and is done on the machine that
runs Hermes: over the SSH connection in `ssh` mode, right here on this
machine in `local` mode — the same shell scripts, wherever Hermes is.

| What | How |
| --- | --- |
| Creating a bot | Hermes' own profile build, run as a script on the host. |
| The list of bots | Read from the profiles on disk, or from the gateway when it answers. |
| The app's preferences | Written next to the primary profile, and read back from there. |
| An attached file | Copied to `$HOME/.hermes/attachments/`; the message carries the path. |
| A recording | Copied to the same place and transcribed by Hermes' own python. |

The bytes of a file never go through a command line: they are piped into the
remote file.

## Why not a general protocol

Other apps in this space speak a general agent protocol — AG-UI, for
instance — and let any runtime be plugged in behind it. That is the right
idea for a platform that has to host many runtimes at once.

This app is not a platform: it is one window onto one harness. It speaks
Hermes' API directly, so it can use what Hermes already knows — profiles with
their own keys, sessions with their own transcripts, models with their own
quotas — without re-implementing any of it.

The cost is honest and worth stating: **another harness is not a
configuration change here.** Swapping Hermes for something else means
writing another bridge, the equivalent of an AG-UI adapter for Hermes. The
code that does the talking is `electron/main.js`, and the shape of it is
`src/hermes.d.ts`, so that work stays contained — but it is work.

What the trade buys: no agent runtime to install, to update, to secure or to
pay for, and no second copy of the truth. The conversation is where it
already was.
