import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Bloub } from './Bloub';
import type { Suggested } from '../faces';
import { C, INK, box, createStyles } from '../theme';

/**
 * The arc a bot is picked on: the faces sit on a wide circle, the one at the
 * centre stands up straight and full size, the others lean away and lift as
 * they leave, as if the row were the rim of a wheel.
 *
 * It scrolls and it snaps: the arc settles with a face in the middle, and
 * that face is the one Customize takes. A tap on a face is the same gesture,
 * done in one step.
 */
const FACE = box(56);
const GAP = box(13);
const STEP = FACE + GAP;

/** The circle the faces stand on: wide enough that the lift stays a curve. */
const RADIUS = box(415);
const SPAN = 3;
const STAGE = FACE + Math.ceil(RADIUS - Math.sqrt(RADIUS * RADIUS - (SPAN * STEP) ** 2)) + box(6);

/** How far up the arc the face at `p` points from the centre sits. */
function lift(p: number): number {
  return RADIUS - Math.sqrt(RADIUS * RADIUS - p * p);
}

/** How far it leans: the tangent of the circle, in degrees. */
function tilt(p: number): number {
  return (Math.asin(p / RADIUS) * 180) / Math.PI;
}

const STOPS = Array.from({ length: SPAN * 2 + 1 }, (_, n) => n - SPAN);
const LIFTS = STOPS.map((k) => -lift(k * STEP));
const TILTS = STOPS.map((k) => `${tilt(-k * STEP)}deg`);
const SCALES = STOPS.map((k) => 1 - (0.16 * Math.min(Math.abs(k), SPAN)) / SPAN);
const OPACITIES = STOPS.map((k) => 1 - (0.55 * Math.min(Math.abs(k), SPAN)) / SPAN);

export function BotArc({
  faces,
  onCustomize,
}: {
  faces: Suggested[];
  onCustomize: (face: Suggested) => void;
}) {
  const window = useWindowDimensions();
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const start = Math.floor(faces.length / 2);
  const [index, setIndex] = useState(start);

  // The arc opens in the middle of itself: a face with others on both sides,
  // not a row that starts against the edge of the screen.
  useEffect(() => {
    scroller.current?.scrollTo({ x: start * STEP, animated: false });
  }, [start]);

  const face = faces[index] ?? faces[0];

  function clamp(value: number) {
    return Math.max(0, Math.min(faces.length - 1, value));
  }

  /** The finger let go: the nearest face comes to the middle, nothing else. */
  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = clamp(Math.round(event.nativeEvent.contentOffset.x / STEP));
    setIndex(next);
    scroller.current?.scrollTo({ x: next * STEP, animated: true });
  }

  function bring(next: number) {
    if (next === index) return;
    setIndex(next);
    scroller.current?.scrollTo({ x: next * STEP, animated: true });
  }

  return (
    <View style={styles.stageWrap}>
      <View style={styles.middle}>
        <Animated.ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          snapToInterval={STEP}
          disableIntervalMomentum
          contentContainerStyle={{
            alignItems: 'flex-end',
            paddingHorizontal: (window.width - STEP) / 2,
            paddingBottom: box(2),
          }}
          style={{ height: STAGE }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: Platform.OS !== 'web',
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = clamp(Math.round(event.nativeEvent.contentOffset.x / STEP));
              setIndex((current) => (current === next ? current : next));
            },
          })}
          scrollEventThrottle={16}
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}
        >
          {faces.map((entry, position) => {
            const inputRange = STOPS.map((k) => (position + k) * STEP);
            const pick = (outputRange: number[]) =>
              scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

            return (
              <Animated.View
                key={entry.id}
                style={[
                  styles.slot,
                  {
                    width: STEP,
                    height: FACE,
                    opacity: pick(OPACITIES),
                    transform: [
                      { translateY: pick(LIFTS) },
                      {
                        rotate: scrollX.interpolate({
                          inputRange,
                          outputRange: TILTS,
                          extrapolate: 'clamp',
                        }),
                      },
                      { scale: pick(SCALES) },
                    ],
                  },
                ]}
              >
                <Pressable
                  onPress={() => bring(position)}
                  accessibilityRole="button"
                  accessibilityLabel={`Face ${entry.name}`}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Bloub shape={entry.shape} color={entry.color} size={FACE} />
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.ScrollView>
      </View>

      <Text style={styles.name}>{face?.name ?? ''}</Text>

      <View style={styles.foot}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => face && onCustomize(face)}
          disabled={!face}
          accessibilityLabel="Customize this bot"
        >
          <Text style={styles.primaryText}>Customize</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = createStyles({
  stageWrap: { flexGrow: 1 },
  middle: { flexGrow: 1, justifyContent: 'center' },
  slot: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  name: {
    marginTop: 4,
    color: C.text,
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  foot: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10 },
  primary: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.paper },
  primaryText: { color: INK.onPaper, fontSize: 14, fontWeight: '600' },
});
