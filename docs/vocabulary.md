# Vocabulary

The words this project uses, and what they mean here. Several of them mean
something else in other projects, so this page exists to keep the app, its
documentation and its commit messages speaking the same language.

## Harness

The runtime that decides what happens next in a conversation: the model call,
the tools, the memory, the loop, the credentials, the retry when the quota is
spent. A harness is what an agent is *run by*.

**Hermes is the harness.** This app never runs an agent loop, never calls a
model and never holds the result of a tool. When a bot answers, Hermes decided
what the answer would be; this app drew it.

## Interface

The window onto a harness. It reads a conversation, writes a turn, draws it,
and leaves the decisions to the harness.

**This app is the interface.** "Hermes Bot is an interface for Hermes" is the
whole sentence, and it is the sentence to keep: it says what the app is
responsible for, and it says what it is not.

## Connection

The link between the app and Hermes. One record holds the one fact it starts
with — where Hermes runs, `local` for this machine, `ssh` for another one —
and everything that follows from it: the host when there is one, the ports,
and whether the person has already placed their Hermes.

**The mode is the choice; the rest follows from it.** A Hermes on this
machine is reached on the API port itself, with no tunnel; a Hermes on
another machine is reached through an SSH tunnel. The record is the app's
own (`hermes-connection.json`), and the rules that read it are
`electron/connection.js`, tested to the line. A record written before the
mode existed — a host with no mode — is read as `ssh`; an empty record is
`local`.

## Setup

The door the person walks through the first time the app opens. Six scenes:
the welcome, the connection, the name of the bot, its face, its colour, and
the door that opens.

**The setup is the app talking, not the harness.** It reads the bots from the
host the way the sidebar does, and it writes down one fact of its own: that it
has been walked through.

**The setup is a scene, not a form.** One character acts in it — it breathes,
it blinks, it thinks while the connection is tested, and it is happy when
Hermes answers. The words are few on purpose.

**The setup makes the first bot, and does not show the others.** An app that
has just been installed has no agents: there is nothing to list, so the pages
that make the bot do not show what the host already serves. The bot is not
the point of the setup — there is a way to leave it for later, and the default
bot is always there to talk to.

## Bot

A Hermes profile with a face. A bot has a name, a colour and a shape, and
those three travel in the metadata of its own profile on the server, next to
what Hermes already paints it with. A bot that comes back after a restart is
the same bot.

## Session

One conversation, as Hermes holds it. The transcript lives in the session, and
nowhere else: not in a file on this machine, not in the Keychain, not in
`localStorage`.

## Conversation

What the person reads: the messages of one session, plus the identity of who
wrote them. A conversation is a view of a session, not a copy of it.

## Past conversation

A session the app did not open — the CLI wrote it, another client, an older
install — listed under the bot whose profile holds it. It is the same session,
not a copy: continuing it writes where the messages already are, and the app
keeps nothing. A conversation belongs to a profile, so no bot is invented for
one, and a group is never one of them.

## Group

A set of bots answering the same message. A group is not a Hermes object: it
is rebuilt from the titles of its members' conversations
(`Group · <group> · <member>`), so the link between a thread and the session
behind it never breaks.

## Wave

One round of a group. Every member is asked at the same time and their
answers stream side by side. A bot that writes `@Name` gives that member the
next wave, and only that member.

## Tapback

A reaction on a message. In a group it is signed, so two bots can tap the
same message without overwriting one another, and clicking it opens the bots
that left it, and with what.

## Silence

`[[silent]]`. A member that has nothing to say writes it and stays out of the
way, but it never vanishes: the app leaves a small tapback in its place, so
"no reply" is an answer the person can read.

## What we are not

Not a harness. Not a platform. Not a runtime. Not a place where a
conversation is kept.

Notably, we are **not** harness-agnostic either: we speak Hermes' own API and
not a general agent protocol, so swapping the harness is not a configuration
change here. That is a deliberate trade, and
[architecture.md](architecture.md) says what it buys and what it costs.
