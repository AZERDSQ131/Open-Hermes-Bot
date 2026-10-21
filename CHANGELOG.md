# Changelog

The versions of Hermes Bot, and what each one changed. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **A setup, step by step.** The first time the app opens, it asks where
  Hermes lives, for the key that opens the door, and who answers on the other
  side — one question at a time. It shakes hands with the host, shows the bots
  it serves, and lets the first one be made on the spot. The setup can be run
  again from **Settings → Setup**, whenever Hermes moves to another machine.
- **An actor for the setup.** The setup is not a page of forms: it is a scene
  with one character in it, that breathes, blinks, changes shape from one
  question to the next, thinks while the tunnel opens, and celebrates when the
  host answers.

### Fixed

- **An error the person can read.** A command that never ran has no stderr to
  read, and reading it anyway threw: the app answered with an exception
  instead of saying what went wrong. It shows up on a machine that has not been
  told where Hermes lives yet.

## [1.0.0] — 2026-10-21

The first release.

### Added

- **A window onto Hermes.** The app talks to a Hermes host over SSH, and
  draws the conversations it finds there. The bots, the groups and the
  conversations live on the host; the app keeps none of them.
- **Conversations that survive.** A conversation is read back from the server
  when it is opened, so closing the app, wiping it or reinstalling it costs
  nothing. The transcript, the identity of the bots and the models the person
  picked all live on the host.
- **Groups of bots.** Every member of a group is asked at the same time, and
  their answers stream side by side. A member that has nothing to say says so
  with a tapback instead of vanishing. A bot that names another hands it the
  floor, and stops it if it is still writing.
- **Files and voice.** A file you attach is copied to the server, where the
  bot can read it. The microphone dictates: Hermes transcribes the recording
  on your own host, and the words land in the composer.
- **A model picker.** The models the bot's providers offer, the ones to hide,
  the ones to pin, and the one each bot falls back to. When a model is out of
  quota, the turn retries on a free one and says so.
- **A release on GitHub.** A signed build of the app for macOS, published on
  the releases page, and an app that finds its own next version there.
