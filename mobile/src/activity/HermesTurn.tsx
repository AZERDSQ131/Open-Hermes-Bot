import { Circle, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  opacity,
  padding,
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
  phase: TurnPhase;
  /** The last words of the answer, or what the turn had to say. */
  preview: string;
  /** Epoch milliseconds; the timer under the name counts from here. */
  startedAt: number;
};

const HermesTurn = (props: HermesTurnProps, _environment: LiveActivityEnvironment) => {
  'widget';

  const TEXT = '#F3F3F5';
  const DIM = '#B9B9C0';
  const FAINT = '#8C8C93';
  const BG = '#19191B';
  const accent = props.color || '#8B5CF6';

  const active = props.phase === 'thinking' || props.phase === 'writing';
  const initial = (props.botName || 'H').trim().charAt(0).toUpperCase();
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

  /** The bot, in its own colour: a disc and its first letter. */
  const Face = ({ size, soft = false }: { size: number; soft?: boolean }) => (
    <ZStack alignment="center" modifiers={[frame({ width: size, height: size })]}>
      <Circle modifiers={[foregroundStyle(accent), opacity(soft ? 0.28 : 1)]} />
      <Text
        modifiers={[
          font({
            weight: 'bold',
            size: Math.max(10, Math.round(size * 0.42)),
            design: 'rounded',
          }),
          foregroundStyle(soft ? accent : '#FFFFFF'),
        ]}
      >
        {initial}
      </Text>
    </ZStack>
  );

  /** While the turn runs, the seconds; once it is over, the sign that it is. */
  const Pulse = ({ size = 12 }: { size?: number }) =>
    active ? (
      <HStack spacing={5}>
        <Circle modifiers={[foregroundStyle(accent), frame({ width: 6, height: 6 })]} />
        <Text
          date={started}
          dateStyle="timer"
          countsDown={false}
          modifiers={[
            font({ weight: 'medium', size }),
            monospacedDigit(),
            foregroundStyle(DIM),
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
    compactLeading: <Face size={20} soft={!active} />,
    compactTrailing: <Pulse size={11} />,

    // Minimal Island: a dot in the bot's colour is all there is room for.
    minimal: (
      <Circle
        modifiers={[foregroundStyle(accent), frame({ width: 9, height: 9 }), opacity(active ? 1 : 0.5)]}
      />
    ),

    // Expanded Island: who is working, for how long, and what was said.
    expandedLeading: (
      <HStack spacing={7} modifiers={[padding({ leading: 10 })]}>
        <Face size={22} soft={!active} />
        <Text
          modifiers={[
            font({ weight: 'semibold', size: 14 }),
            foregroundStyle(TEXT),
            lineLimit(1),
          ]}
        >
          {props.botName}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 10 })]}>
        <Pulse size={12} />
      </HStack>
    ),
    expandedCenter: active ? (
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(DIM)]}>{status}</Text>
    ) : undefined,
    expandedBottom: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ horizontal: 10, bottom: 2 })]}>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(active ? DIM : TEXT), lineLimit(2)]}>
          {line}
        </Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(FAINT)]}>Hermes Bot</Text>
      </VStack>
    ),
  };
};

/**
 * The layout, registered once. Each turn starts an instance of it: the factory
 * is keyed by this name, so it must not be renamed at one call site only.
 */
export default createLiveActivity<HermesTurnProps>('HermesTurn', HermesTurn);
