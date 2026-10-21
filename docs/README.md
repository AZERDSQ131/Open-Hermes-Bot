# Documentation

The pages here say how the app is put together. The [README](../README.md) is
the tour; these are the details.

- [Vocabulary](vocabulary.md) — what a harness is, what an interface is, and
  the words this project uses for a bot, a session, a group, a wave.
- [Architecture](architecture.md) — the boundary between the app and Hermes:
  what each side owns, and what the app does not keep.
- [Transport](transport.md) — the SSH tunnel, the Hermes API calls, and why
  this app speaks one harness rather than a general agent protocol.

One sentence to keep in mind while reading any of them: **this app is an
interface for Hermes.** It is not a harness.
