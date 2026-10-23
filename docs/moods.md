# Moods

What the faces play, and when. The word itself comes from
[dsh-bloub-mood](https://github.com/Yuuhann1999/dsh-bloub-mood), whose
staging of the [bloub](https://github.com/jeremy-prt/bloub) avatar this app
re-uses: five moods, each a loop of engine states, each a whole theatre.

- [`src/moods.ts`](../src/moods.ts) — the scores: what each mood walks, and
  the several answers to "what should this face be playing".
- [`src/components/MoodBloub.tsx`](../src/components/MoodBloub.tsx) — the
  actor: it walks a score around the clock, dozes when the quiet is long,
  and (when a scene allows the hand) loans another face to a click.

## The five moods

| Mood | When | The theatre |
|---|---|---|
| `idle` | nobody is working | breath, blink, and the body turns into a hexagon |
| `running` | a turn is in flight | thought, the comet's dash, and back |
| `interaction` | the bot needs a look: not served yet, a version seen | stare, alarm, notification bounce |
| `completed` | an answer arrived, unread | gasp, tap, burst of confetti |
| `sleepy` | quiet for two minutes | the doze |

The transformation is part of quietness: `idle` carries the hexagon morph,
played in the bot's own colour — nothing asks for a look, the face merely
lives.

## Where each mood is read

- A thread of the sidebar says what it is doing. A turn in flight outranks an
  unread answer; a bot that is not served yet outranks them both
  (`threadMood`).
- The round face at the foot of the sidebar reads the update the same way
  (`updateMood`): the look runs while the app checks or downloads, the
  asking stare when a version was seen, the burst when it has arrived.
- The setup walks its actor through them by hand: the comet while the
  connection opens, the celebration burst when it does, and the bot that
  was made ends the walk with a celebration in the colour and shape that
  were picked.

## The rules that hold everywhere

- **Nothing is kept.** A mood is a view of facts that already exist — the
  turn, the socket, the download. The `localStorage` stays empty; what a
  click loans (a face) travels with the scene, never into a store.
- **The idle row stays still.** A sidebar row only wakes for a non-idle
  mood: reading people are not interrupted by a dozen breathing faces.
  Quiet rows wear the still face, as they always did.
- **The click is a scene's grace.** A row of the sidebar is navigation: its
  click goes to the row. The actor of the setup is for touching.
- **Reduced motion holds still.** With "reduce" asked, the theatre draws one
  frame and stops.
