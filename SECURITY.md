# Security

## What the app holds

- **The API key of your Hermes host**, in the login Keychain, under the
  service `Hermes Bot`. The app reads it to talk to the host and to read the
  key from the host's own `.env` when you ask it to.
- **The address of your Hermes host** and the port it is reached on, in
  `~/Library/Application Support/Hermes Bot/`.
- **Nothing else.** No conversation, no transcript, no preference: those live
  on the host, where Hermes keeps them.

## What it does with it

The app opens an SSH tunnel to the host you named, and calls the Hermes API
through it. The key never leaves the Keychain, and the tunnel is closed when
the app quits.

## Reporting a problem

If you find something wrong — a key that leaks, a tunnel that listens where
it should not, a conversation that ends up somewhere it should not — report it
privately:

<https://github.com/AZERDSQ131/Open-Hermes-Bot/security/advisories/new>

Please do not open a public issue for a vulnerability. You will get an answer.
