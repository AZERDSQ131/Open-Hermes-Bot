import { Capsule, Circle, Ellipse, HStack, Image, RoundedRectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  clipShape,
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  opacity,
  padding,
  scaleEffect,
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
  /** Bumped by the app while the turn runs: the face breathes with it. */
  beat?: number;
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

  const started = new Date(props.startedAt);
  const beat = props.beat ?? 0;
  // Every beat flips the face between two sizes: the activity is updated
  // while the turn runs, and the movement between the two is what the person
  // sees. Thinking breathes slowly and deep; writing keeps a quicker, smaller
  // pulse. A face that is over no longer moves.
  const breathe = !active
    ? 1
    : props.phase === 'thinking'
      ? beat % 2 === 0
        ? 0.9
        : 1
      : beat % 2 === 0
        ? 0.96
        : 1;
  const tempo = props.phase === 'thinking' ? 0.9 : 0.5;

  /** The bot's Bloub face: its body shape and its two eyes, not a dot. */
  const Face = ({ size, soft = false }: { size: number; soft?: boolean }) => {
    const body =
      props.shape === 'capsule' ? (
        <Capsule modifiers={[foregroundStyle(accent)]} />
      ) : props.shape === 'goutte' ? (
        <Ellipse modifiers={[foregroundStyle(accent)]} />
      ) : props.shape === 'cercle' || !props.shape ? (
        <Circle modifiers={[foregroundStyle(accent)]} />
      ) : (
        <RoundedRectangle
          cornerRadius={Math.round(size * 0.32)}
          modifiers={[foregroundStyle(accent)]}
        />
      );
    const eye = Math.max(2, Math.round(size * 0.13));
    return (
      <ZStack
        alignment="center"
        modifiers={[
          frame({ width: size, height: size }),
          opacity(soft ? 0.55 : 1),
          scaleEffect(breathe),
          animation(Animation.easeInOut({ duration: tempo }), beat),
        ]}
      >
        {body}
        <HStack spacing={Math.max(2, Math.round(size * 0.17))}>
          <Circle modifiers={[foregroundStyle('#FFFFFF'), frame({ width: eye, height: eye })]} />
          <Circle modifiers={[foregroundStyle('#FFFFFF'), frame({ width: eye, height: eye })]} />
        </HStack>
      </ZStack>
    );
  };

  /** While the turn runs, the seconds; once it is over, the sign that it is. */
  const Pulse = ({ size = 12 }: { size?: number }) =>
    active ? (
      // Fixed width, and intrinsic: a flexible timer would ask the compact
      // Island for all the room it can give, and stretch the pill.
      <HStack spacing={5} modifiers={[fixedSize({ horizontal: true })]}>
        <Circle modifiers={[foregroundStyle(accent), frame({ width: 6, height: 6 })]} />
        <Text
          date={started}
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

    // Compact Island: the face, and the timer that keeps the seconds honest.
    compactLeading: (
      <ZStack modifiers={[frame({ width: 22, height: 22 })]}>
        <Face size={20} soft={!active} />
      </ZStack>
    ),
    compactTrailing: (
      <ZStack modifiers={[frame({ width: 46, height: 20, alignment: 'trailing' })]}>
        <Pulse size={11} />
      </ZStack>
    ),

    // Minimal Island: the bot's face, small — the same face as everywhere.
    minimal: <Face size={16} soft={!active} />,

    // Expanded Island: the banner's own rows, at the size the island allows.
    expandedLeading: (
      <HStack spacing={10} modifiers={[padding({ leading: 10 })]}>
        <Face size={36} soft={!active} />
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[
              font({ weight: 'semibold', size: 17 }),
              foregroundStyle(TEXT),
              lineLimit(1),
            ]}
          >
            {props.botName}
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(FAINT)]}>{status}</Text>
        </VStack>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 10 })]}>
        <Pulse size={14} />
      </HStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 10, bottom: 2 })]}>
        <Text
          modifiers={[
            font({ size: 15 }),
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
    ),
  };
};

/**
 * The layout, registered once. Each turn starts an instance of it: the factory
 * is keyed by this name, so it must not be renamed at one call site only.
 */
export default createLiveActivity<HermesTurnProps>('HermesTurn', HermesTurn);
