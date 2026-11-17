# Setups: where Hermes runs, and how many bots

The app asks one question - where does Hermes run - and writes the answer down.
This page is the recipes: what goes on which machine, which command makes the
key, and what the app does with the answer. The mechanism behind it is in
[transport.md](transport.md); this is the part you do.

## What every setup needs

| | On this Mac | On another machine |
|---|---|---|
| Hermes | installed here | installed there |
| The app reaches it | the API port itself | an SSH tunnel it opens |
| `API_SERVER_KEY` | in `~/.hermes/.env` here | in `~/.hermes/.env` there |
| What the app reads it from | *Read it from this Mac* | *Read it from \<host\>* over SSH |
| A port to open on the network | none | none |

The key is the switch. Hermes' API server is off until `API_SERVER_KEY` holds
16 characters or more, so a Hermes that was installed through the desktop app
has no server to reach yet, and the setup says what to run rather than fail
with the shell's `API_SERVER_KEY not found`. The gateway has to be running for
the key to be served.

## This Mac

```bash
hermes setup                 # the interactive setup, if Hermes is new here
hermes config set API_SERVER_KEY "$(openssl rand -hex 24)"
hermes gateway restart
```

Then in the app: *On this Mac*, and *Read it from this Mac*. The key goes into
the login Keychain, and the app talks to `127.0.0.1:8642` directly. Nothing
else is needed: no account, no tunnel, no port.

Three bots on this Mac is three profiles on this Mac - see below.

## A machine on your LAN, or a VPS

Both are the same answer: another machine, reached over SSH. The app does not
speak plain HTTP across a network; it opens a forward and speaks to it as if it
were local, so there is nothing to expose and no certificate to serve.

```bash
# on the other machine
ssh you@pi                 # by the name your ~/.ssh/config already uses
hermes setup
hermes config set API_SERVER_KEY "$(openssl rand -hex 24)"
hermes gateway restart
hermes gateway status      # it has to say running
```

Then in the app: *On another machine*, the **SSH host** - the name your
`~/.ssh/config` uses, which the setup offers as a list - and *Read it from
\<host\>*.

Behind it, the app runs:

```
ssh -N -L 127.0.0.1:18742:127.0.0.1:8642 <host>
```

The forward lands on the host's own loopback, where Hermes' API server
listens: `18742` is the local end, `8642` the host's. A VPS wants exactly the
same thing, and its firewall can stay closed: port `8642` is never reached
from outside the machine, because the only caller is the tunnel's other end.

Two things the tunnel does not fix, so they are worth knowing before you meet
them:

- The key is read on the host, over the same SSH, when the app has none or has
  a stale one. It is adopted only when the host accepts it.
- A machine that is asleep, or an SSH that needs a password rather than a key,
  is a connection the app cannot open by itself. It says so, with the words of
  the read that failed.

## Several bots on one host

A bot is a Hermes profile: its own key, its own environment, its own sessions.
The app lists the profiles it finds and serves each conversation under
`/p/<profile>`, so a bot's turn is answered by that bot's own gateway and
checked against that bot's own key.

A profile has to have its own `API_SERVER_KEY`, and its own gateway running,
or the app can list it and not talk to it:

```bash
hermes profile create work        # a new profile, its own ~/.hermes/profiles/work
hermes profile alias work         # a `work` command that runs Hermes as that profile
work config set API_SERVER_KEY "$(openssl rand -hex 24)"
work gateway restart
work gateway status
```

The app then shows two bots, and a group can hold both. The primary profile
carries the app's own preferences; the others are as private as any profile is
- a group conversation is the app's room, and the bots in it still keep their
own memory and their own credentials.

The name, the colour and the face of a bot are written into its own profile, so
a bot is the same bot on another Mac with the app pointed at the same host.

## Moving a host, or a key that moved

Point the app at the new machine from **Settings → Setup**: the mode, the host
and the key are asked again, and the old key stays in the Keychain only as long
as you leave it there.

A key that was rotated on the host is not a dead end. A health probe that
answers `401` makes the app read `API_SERVER_KEY` from the Hermes home of the
machine it is talking to, and adopt it when the host accepts it -
[transport.md](transport.md) has those rules, and `electron/keys.js` holds them
in code.

## What a setup does not need

- No account anywhere: no Nous account, no cloud, no sign-in for the app
  itself. The Nous sign-in the connectors page offers is the host's account,
  for the services it connects to.
- No model key in the app. The models belong to the host; the app shows the
  list Hermes offers and sends the pick with each turn.
- No port opened on the host, in any setup. The only listener the app makes is
  the local end of its own SSH forward, and the bridge the phone pairs with,
  which stays on the loopback and is published to your own tailnet when you ask
  for it ([mobile.md](mobile.md)).
