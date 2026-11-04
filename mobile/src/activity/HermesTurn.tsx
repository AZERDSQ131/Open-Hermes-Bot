import { Capsule, Circle, Ellipse, HStack, Image, RoundedRectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  offset,
  opacity,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/**
 * The turn in the Live Activity: the answer being thought about, being written,
 * and the line it ended on.
 *
 * Everything the Lock Screen and the Dynamic Island draw comes through `props`,
 * and everything else is declared inside the `'widget'` function: that body is
 * serialized on its own and runs in the widget's runtime, where the app's
 * modules and top-level values do not exist. Dates cross the bridge as epoch
 * milliseconds for the same reason — the layout rebuilds them here.
 */

export type TurnPhase = 'thinking' | 'writing' | 'answered' | 'cut';

/** One bot on the Island's queue: the face, and the turn's own clock. */
export type QueueFace = {
  color: string;
  shape?: string;
  startedAt: number;
};

export type HermesTurnProps = {
  /** The bot's name, as the conversation shows it. */
  botName: string;
  /** The bot's colour, so the face in the Island is the same face. */
  color: string;
  /** The bot's Bloub shape: cercle, capsule, galet, squircle, goutte… */
  shape?: string;
  phase: TurnPhase;
  /** The last words of the answer, or what the turn had to say. */
  preview: string;
  /** Epoch milliseconds; the timer under the name counts from here. */
  startedAt: number;
  /**
   * The real Bloub, drawn by the app and stored where the widget can read it.
   * One picture per variant; the activity uses the first, still.
   */
  faceUris?: string[];
  /**
   * Every bot with a turn in flight, in the order the turns started. All of
   * them are drawn side by side; the clock is the oldest running turn's.
   */
  queue?: QueueFace[];
};

const HermesTurn = (props: HermesTurnProps, _environment: LiveActivityEnvironment) => {
  'widget';

  const TEXT = '#F3F3F5';
  const DIM = '#B9B9C0';
  const FAINT = '#8C8C93';
  const BG = '#19191B';
  const accent = props.color || '#8B5CF6';

  const active = props.phase === 'thinking' || props.phase === 'writing';
  const preview = (props.preview || '').replace(/\s+/g, ' ').trim();

  const status =
    props.phase === 'thinking'
      ? 'Thinking'
      : props.phase === 'writing'
        ? 'Writing'
        : props.phase === 'answered'
          ? 'Answered'
          : 'Cut short';

  const line =
    preview ||
    (props.phase === 'thinking'
      ? 'Reading your message…'
      : props.phase === 'writing'
        ? 'Writing the answer…'
        : status);

  const frames = props.faceUris ?? [];
  const faceUri = frames[0];
  // Every running agent is on the Island at once, side by side, in the order
  // their turns started. One agent is a face; several are a row of faces.
  const roster: QueueFace[] =
    props.queue && props.queue.length
      ? props.queue
      : [{ color: props.color, shape: props.shape, startedAt: props.startedAt }];

  /** The bot's Bloub face: the drawn shape, or the real sprite when it fits. */
  const Face = ({
    size,
    soft = false,
    tint,
  }: {
    size: number;
    soft?: boolean;
    tint?: QueueFace;
  }) => {
    const faceColor = tint?.color || accent;
    const faceShape = tint?.shape ?? props.shape;
    // A sprite is only used where there is room to read it, and only for the
    // activity's own bot; a face from the queue is drawn in its colour.
    const picture = !tint && faceUri && size >= 30 ? faceUri : undefined;
    const body =
      faceShape === 'capsule' ? (
        <Capsule modifiers={[foregroundStyle(faceColor)]} />
      ) : faceShape === 'goutte' ? (
        <Ellipse modifiers={[foregroundStyle(faceColor)]} />
      ) : faceShape === 'cercle' || !faceShape ? (
        <Circle modifiers={[foregroundStyle(faceColor)]} />
      ) : (
        <RoundedRectangle
          cornerRadius={Math.round(size * 0.32)}
          modifiers={[foregroundStyle(faceColor)]}
        />
      );
    const eye = Math.max(2, Math.round(size * 0.13));
    return (
      <ZStack
        alignment="center"
        modifiers={[
          frame({ width: size, height: size }),
          opacity(soft ? 0.55 : 1),
        ]}
      >
        {picture ? (
          <Image
            uiImage={picture}
            modifiers={[resizable(), frame({ width: size, height: size })]}
          />
        ) : (
          <>
            {body}
            <HStack spacing={Math.max(2, Math.round(size * 0.17))}>
              <Circle modifiers={[foregroundStyle('#FFFFFF'), frame({ width: eye, height: eye })]} />
              <Circle modifiers={[foregroundStyle('#FFFFFF'), frame({ width: eye, height: eye })]} />
            </HStack>
          </>
        )}
      </ZStack>
    );
  };

  /** The running agents, all of them, in the order their turns started. */
  const Roster = ({ size, overlap = 4 }: { size: number; overlap?: number }) =>
    roster.length === 1 ? (
      <Face size={size} />
    ) : (
      <HStack spacing={-overlap}>
        {roster.slice(0, 4).map((face, index) => (
          <Face key={index} size={size} tint={face} />
        ))}
      </HStack>
    );

  /** While the turn runs, the seconds; once it is over, the sign that it is. */
  const Pulse = ({ size = 12, from }: { size?: number; from?: number }) => {
    const clock = new Date(from ?? props.startedAt);
    return active ? (
      // Fixed width, and intrinsic: a flexible timer would ask the compact
      // Island for all the room it can give, and stretch the pill.
      <HStack modifiers={[fixedSize({ horizontal: true })]}>
        <Text
          date={clock}
          dateStyle="timer"
          countsDown={false}
          modifiers={[
            font({ weight: 'medium', size }),
            monospacedDigit(),
            foregroundStyle(DIM),
            frame({ width: Math.round(size * 3), alignment: 'trailing' }),
            fixedSize({ horizontal: true }),
          ]}
        />
      </HStack>
    ) : (
      <Image
        systemName={props.phase === 'answered' ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
        size={size + 2}
        color={props.phase === 'answered' ? accent : FAINT}
      />
    );
  };

  return {
    // The Lock Screen, and the notification the turn leaves behind.
    banner: (
      <ZStack
        alignment="leading"
        modifiers={[containerBackground(BG, 'widget'), clipShape('containerRelativeShape')]}
      >
        <VStack
          alignment="leading"
          spacing={10}
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'leading' }),
            padding({ all: 16 }),
          ]}
        >
          <HStack spacing={10} modifiers={[frame({ maxWidth: Infinity })]}>
            <Face size={30} />
            <VStack alignment="leading" spacing={1}>
              <Text
                modifiers={[
                  font({ weight: 'semibold', size: 15 }),
                  foregroundStyle(TEXT),
                  lineLimit(1),
                ]}
              >
                {props.botName}
              </Text>
              <Text modifiers={[font({ size: 11 }), foregroundStyle(FAINT)]}>{status}</Text>
            </VStack>
            <Spacer />
            <Pulse />
          </HStack>
          <Text
            modifiers={[
              font({ size: 13 }),
              foregroundStyle(active ? DIM : TEXT),
              lineLimit(2),
            ]}
          >
            {line}
          </Text>
          <HStack spacing={6}>
            <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(FAINT)]}>
              Hermes Bot
            </Text>
            <Spacer />
            <Text modifiers={[font({ size: 10 }), foregroundStyle(FAINT)]}>
              {props.phase === 'cut' ? 'interrupted' : 'on the host'}
            </Text>
          </HStack>
        </VStack>
      </ZStack>
    ),

    // Compact Island: the queue's face, and that face's own clock.
    compactLeading: <Roster size={14} overlap={6} />,
    compactTrailing: (
      <ZStack modifiers={[frame({ width: 50, height: 26, alignment: 'trailing' })]}>
        <Pulse size={12} from={roster[0].startedAt} />
      </ZStack>
    ),

    // Minimal Island: every running bot, small, all at once.
    minimal: <Roster size={9} overlap={4} />,

    // Expanded Island: the compact's bubbles and clock, larger. No transcript,
    // no card.
    expandedLeading: (
      <HStack
        modifiers={[
          frame({ height: 48 }),
          padding({ leading: -6 }),
          offset({ x: 4 }),
        ]}
      >
        <Roster size={30} overlap={8} />
      </HStack>
    ),
    expandedTrailing: (
      <HStack
        modifiers={[
          frame({ height: 48 }),
          padding({ trailing: -6 }),
          offset({ x: -2 }),
        ]}
      >
        <Pulse size={19} from={roster[0].startedAt} />
      </HStack>
    ),
  };
};

/**
 * The layout, registered once. Each turn starts an instance of it: the factory
 * is keyed by this name, so it must not be renamed at one call site only.
 */
export default createLiveActivity<HermesTurnProps>('HermesTurn', HermesTurn);
