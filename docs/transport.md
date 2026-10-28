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

## The key

Hermes checks every call against the `API_SERVER_KEY` of its own home
(`~/.hermes/.env`). The app keeps a copy in the Keychain, and that copy is the
only thing it holds about the door — so the copy goes stale: the key is
rotated, Hermes is reinstalled, or the key read on this Mac is still in the
pocket when the person points the app at a Pi.

The machine's own home is the truth. When the health probe answers `401`, the
app reads `API_SERVER_KEY` from the Hermes home of the machine it is talking
to and tries it: the host's key is adopted **only** when the host accepts it,
and the machine it came from is written down beside the connection record. A
key that fails too leaves the old one where it was, and the person reads what
to check instead of a dead end.

A key that came from another machine is not offered as one that fits: the
settings say which machine it belongs to, and the next connect reads the key
of the machine in front of the person. `electron/keys.js` holds those rules,
tested to the line.

The key is also the switch. Hermes' API server is off until the file holds
one: `gateway/config_env.py` turns the platform on from the environment when
`API_SERVER_KEY` is a secret of 16 characters or more, and nothing generates
one. The desktop app Hermes ships with does not need the server, so a person
who installed Hermes through it has no key. The app says so instead of echoing
the shell: the read reports what it found (no file, no line, a key too short,
an SSH that could not run), and `src/setupHelp.ts` turns that into the words
and the commands, tested to the line. The commands go through
`hermes config set`, which writes the key with Hermes' own env writer: the
line is replaced rather than doubled, the file is created when there is none,
and its mode is tightened to 0600, which an append by hand would not do.
The first run and the settings draw the same block, so the two pages cannot
drift apart; the raw output of a shell stays behind **Details**.

## The API

Everything rides `http://127.0.0.1:<localPort>` in `ssh` mode and
`http://127.0.0.1:<apiPort>` in `local` mode, under the prefix of the
profile the call is about — `/p/<profile>` — so a bot's turn is served by that
bot's own gateway and checked against that bot's own key.

| Call | What it does |
| --- | --- |
| `GET /health/detailed` | The connection test: a throwaway tunnel in `ssh` mode, the port itself in `local`. |
| `GET /api/sessions` | The conversations a bot holds, the app's own (`source=api_server`). |
| `GET /api/sessions?order=recent` | Every conversation the bot holds, the app's included: what the history of before is read from. |
| `POST /api/sessions` | Opens a conversation. |
| `GET /api/sessions/<id>/messages` | The transcript, oldest first. |
| `PATCH /api/sessions/<id>` | Renames a conversation. |
| `DELETE /api/sessions/<id>` | Deletes a conversation, and its transcript. |
| `GET /api/sessions/<id>/chat/stream` | A turn, as a stream of text deltas and tool calls. |
| `GET /api/model/options` | The models the bot's providers offer. |

The two reads of `/api/sessions` are the same call asked twice. The sidebar
wants the conversations this app opened — a session carries the source that
opened it — so it asks for `api_server` and nothing else. The list of before
wants the opposite: everything the profile holds, whoever wrote it. Rows that
are already on screen are dropped where the answer is read, not where it is
asked, so a host that ignores the filter changes nothing.

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

## The phone: a bridge on the host, published on the tailnet

The desktop app can open a tunnel because it can run `ssh`. A phone cannot,
and it must not carry the API key of every profile. So the machine that runs
Hermes runs one more small process — `bridge/` — that answers on loopback and
is published to the tailnet by `tailscale serve`:

```
phone ──HTTPS──> tailscale serve ──> 127.0.0.1:8765 (bridge) ──> 127.0.0.1:8642 (Hermes)
```

No port is opened: `tailscale serve` terminates TLS with the tailnet's own
certificate, and only devices on the tailnet reach it. The bridge reads a
profile's `API_SERVER_KEY` when it needs one, on the machine where the key
already is, and never puts it in an answer. The phone holds a device token
instead, minted once from a pairing code: it opens the bridge and nothing else,
and revoking it leaves the keys where they were.

The bridge keeps no conversation. The sessions, the transcripts and the
preferences stay Hermes'; the bridge reads them and streams a turn through.
What it exposes is the mobile app's surface, not Hermes': the bots that are
profiles, their sessions, a transcript, one streamed turn, an attached file, a
recording, the preferences, the devices. `bridge/README.md` is the contract,
and a bot made there is laid out as a real Hermes profile, with a key of its
own.

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
