import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
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
 * centre stands up straight and full size, the others lean away and sink as
 * they leave, as if the row were the rim of a wheel.
 *
 * It has no ends. The faces are laid out three times over, and whenever the
 * row drifts out of the middle copy it is put back by a whole copy — the
 * content is identical there, so the move is not seen. Scrolling left far
 * enough brings back the face that just left on the right: the circle closes.
 *
 * It scrolls and it snaps: the arc settles with a face in the middle, and
 * that face is the one Customize takes. A tap on a face is the same gesture,
 * done in one step.
 */
const FACE = box(56);
const GAP = box(13);
const STEP = FACE + GAP;

/**
 * The circle the faces stand on. Wide, but a circle you can read: the faces
 * at the ends of the row lean away and sit lower than the one in the middle.
 */
const RADIUS = box(330);
const SPAN = 3;
const STAGE = FACE + Math.ceil(RADIUS - Math.sqrt(RADIUS * RADIUS - (SPAN * STEP) ** 2)) + box(6);

/** The same faces three times over: the middle one is where we keep it. */
const COPIES = 3;

/** Out of the middle copy: put it back by a whole copy. */
function wrapped(raw: number, count: number): number {
  if (!count) return raw;
  if (raw < count) return raw + count;
  if (raw >= count * 2) return raw - count;
  return raw;
}

/** How far up the arc the face at `p` points from the centre sits. */
function lift(p: number): number {
  return RADIUS - Math.sqrt(RADIUS * RADIUS - p * p);
}

/** How far it leans: the tangent of the circle, in degrees. */
function tilt(p: number): number {
  return (Math.asin(p / RADIUS) * 180) / Math.PI;
}

const STOPS = Array.from({ length: SPAN * 2 + 1 }, (_, n) => n - SPAN);
// The arch: the face at the centre is the top of it, and the ones that leave
// sink as they go. The row is laid out from the top so the sinking has room.
const LIFTS = STOPS.map((k) => lift(k * STEP));
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
  const count = faces.length;
  const reel = useMemo(() => (count ? Array.from({ length: COPIES }, () => faces).flat() : []), [count, faces]);
  const start = count ? count + Math.floor(count / 2) : 0;
  const [at, setAt] = useState(start);
  const index = count ? ((at % count) + count) % count : 0;
  const face = faces[index];
  // The wheel listener is attached once, so it reads the count from a ref.
  const countRef = useRef(count);
  countRef.current = count;
  // Where the arc was last put. The scroll position can only be set once the
  // content has a width, which is a size change, not an effect.
  const placed = useRef<number | null>(null);

  /**
   * The arc opens in the middle copy, on the middle face: a face with others
   * on both sides, not a row that starts against the edge of the screen.
   */
  function place() {
    if (!count || placed.current === start) return;
    placed.current = start;
    scrollX.setValue(start * STEP);
    scroller.current?.scrollTo({ x: start * STEP, animated: false });
    setAt(start);
  }

  /**
   * A mouse has no sideways gesture: over the arc, the wheel drives it, and
   * the row settles on the nearest face once the wheel has stopped.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const instance = scroller.current as unknown as {
      getScrollableNode?: () => HTMLElement | null;
      getNode?: () => HTMLElement | null;
    } | null;
    // react-native-web exposes the scrolling element under one of these names.
    const node = instance?.getScrollableNode?.() ?? instance?.getNode?.();
    if (!node) return;

    let idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        const raw = Math.round(node.scrollLeft / STEP);
        const back = wrapped(raw, countRef.current);
        setAt(back);
        if (back === raw) {
          node.scrollTo({ left: back * STEP, behavior: 'smooth' });
        } else {
          scrollX.setValue(back * STEP);
          node.scrollLeft = back * STEP;
        }
      }, 140);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (idle) clearTimeout(idle);
      node.removeEventListener('wheel', onWheel);
    };
    // The node is stable for the life of the arc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The finger let go: the nearest face comes to the middle, nothing else. */
  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!count) return;
    const raw = Math.round(event.nativeEvent.contentOffset.x / STEP);
    // Out of the middle copy: put it back by a copy, without travelling.
    const back = wrapped(raw, count);
    const jumped = back !== raw;
    setAt(back);
    if (jumped) scrollX.setValue(back * STEP);
    scroller.current?.scrollTo({ x: back * STEP, animated: !jumped });
  }

  function bring(next: number) {
    if (next === at) return;
    setAt(next);
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
          contentContainerStyle={{
            alignItems: 'flex-start',
            paddingHorizontal: (window.width - STEP) / 2,
            paddingTop: box(2),
          }}
          style={{ height: STAGE }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: Platform.OS !== 'web',
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / STEP);
              setAt((current) => (current === next ? current : next));
            },
          })}
          scrollEventThrottle={16}
          onContentSizeChange={place}
          onLayout={place}
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}
        >
          {reel.map((entry, position) => {
            const inputRange = STOPS.map((k) => (position + k) * STEP);
            const pick = (outputRange: number[]) =>
              scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

            return (
              <Animated.View
                key={`${position}-${entry.id}`}
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
  // The arc sits low in the sheet, over its name: the room it leaves is above
  // it, not under it.
  middle: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: box(22) },
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
