# The phone

`mobile/` is the same conversation from an iPhone: an Expo app with the
screens, the faces and the composer of the mockup. It has two lives.

Without a bridge it draws the sample it ships with. Paired, it draws Hermes':
the bots are the host's profiles, the threads are their sessions, and a
message sent there is a real turn, streamed as it is written. Disconnecting
puts the sample back.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go**, or press `i` for the simulator. Every
dependency is one Expo Go already carries. `npx expo start --web` opens the
same app in a browser, which is the quickest way to look at a screen and the
only way to drive it without a phone.

The typecheck is the gate: `cd mobile && npx tsc --noEmit`.

## Connect it

The phone does not run SSH and does not hold a Hermes key. It speaks to a
small service on the host — `bridge/` — published on the tailnet by
`tailscale serve`. The path is:

```
phone ──HTTPS──> tailscale serve ──> 127.0.0.1:8765 (bridge) ──> 127.0.0.1:8642 (Hermes)
```

1. Put Tailscale on, on the phone: it must be on the same tailnet.
2. On the host, mint a code: `cd ~/hermes-bridge && python3 -m hermes_bridge pair`.
3. In the app: **Settings → Connection**, the address
   (`https://<host>.<tailnet>.ts.net`), the code, then pair.

The code works once and for twenty minutes. What the phone keeps afterwards is
the bridge's address and its own device token, in the Keychain — nothing else.
A device can be revoked from the same page, and the Hermes keys never left the
host. `bridge/README.md` is the contract on the other side.

## Where things are

| Path | What lives there |
|---|---|
| `App.tsx` | the stack: the list, a conversation, the pages behind them |
| `src/screens/` | one file per screen or sheet |
| `src/components/` | the sheet, the rows, the composer, the faces |
| `src/store.tsx` | the sample, and the bridge once a phone is paired |
| `src/api.ts` | the client: pairing, sessions, one streamed turn |
| `src/data.ts` | the sample's bots, threads, models and words |
| `src/theme.ts` | the palette and the measurements of `mockups/mobile.css` |

The faces are Bloub, from the desktop window's `src/components/bloubFrames.ts`,
drawn with `react-native-svg`.

## What is not wired yet

- The model picker lists the sample; a turn runs on the host's current model.
- Attachments and dictation are the mockup's. The bridge takes both; the app
  does not send the bytes yet.
- Groups are the app's own. Hermes rebuilds them from session titles
  (`Group · <group> · <member>`), which this client does not create.
- The preferences are in memory, though the bridge keeps them on the host.
