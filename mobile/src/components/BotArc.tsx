import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Bloub } from './Bloub';
import type { Suggested } from '../faces';
import { C, INK, box, createStyles } from '../theme';

/**
 * The circle a bot is picked on. One closed ring, turned by the hand: no
 * ends, so the face on the far left always has the one on the far right as
 * its neighbour.
 *
 * The ring is much wider than the window on purpose. Only a slice of it is
 * in sight — five or six faces, leaning further the further they stand — so
 * the row reads as an arc of a circle whose rest is out of frame. The circle
 * is what makes the turning endless; the slice is what makes it an arc.
 *
 * Dragging turns it, a wheel turns it on the web, a tap brings a face to the
 * top, and whatever stands at the top is the one Customize takes.
 */
const FACE = box(34);

/** Far wider than the sheet: the rim crosses the window almost flat. */
const RADIUS = box(300);

/** How far below the top of the stage the chosen face sits. */
const TOP = box(26);

/** A whole number of degrees, positive or negative. */
function mod(value: number, base: number): number {
  return ((value % base) + base) % base;
}

/** The angle equivalent to `target` that is nearest to `from`. */
function nearest(target: number, from: number): number {
  return target + 360 * Math.round((from - target) / 360);
}

export function BotArc({
  faces,
  onCustomize,
}: {
  faces: Suggested[];
  onCustomize: (face: Suggested) => void;
}) {
  const window = useWindowDimensions();
  const count = Math.max(faces.length, 1);
  const slot = 360 / count;
  const slotPx = (2 * Math.PI * RADIUS) / count;
  const degPerPx = 360 / (2 * Math.PI * RADIUS);
  const size = RADIUS * 2 + FACE;

  const [width, setWidth] = useState(window.width);
  const reach = Math.min(width / 2 + FACE / 2, RADIUS * 0.95);
  const rise = RADIUS - Math.sqrt(RADIUS * RADIUS - reach * reach);
  const stage = TOP + Math.ceil(rise) + FACE / 2 + box(10);

  const turn = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  // What the wheel rests on, and how far it has been pulled since. The
  // responder is built once, so everything it reads lives in refs.
  const state = useRef({ turn: 0, index: 0 });
  const geometry = useRef({ slot, slotPx, degPerPx, count });
  geometry.current = { slot, slotPx, degPerPx, count };
  state.current.index = index;
  // The angle the wheel was at when the finger took it.
  const base = useRef(0);

  function goTo(next: number, from: number) {
    const { slot: step } = geometry.current;
    const target = nearest(-next * step, from);
    state.current.turn = target;
    state.current.index = next;
    setIndex(next);
    Animated.spring(turn, {
      toValue: target,
      useNativeDriver: Platform.OS !== 'web',
      speed: 16,
      bounciness: 5,
    }).start();
  }

  // The wheel is dragged from wherever it rests, so the value it rests on is
  // read back from the animation itself, not remembered by hand.
  useEffect(() => {
    const id = turn.addListener(({ value }) => {
      state.current.turn = value;
    });
    return () => turn.removeListener(id);
  }, [turn]);

  const pan = useRef(
    PanResponder.create({
      // A tap belongs to the face under it; only a real pull takes the wheel.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        turn.stopAnimation((value) => {
          base.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        turn.setValue(base.current + gesture.dx * geometry.current.degPerPx);
      },
      onPanResponderRelease: (_, gesture) => {
        const { slotPx: stepPx, count: total, degPerPx } = geometry.current;
        const pulled = base.current + gesture.dx * degPerPx;
        const next = mod(state.current.index - Math.round(gesture.dx / stepPx), total);
        goTo(next, pulled);
      },
    }),
  ).current;

  /**
   * A mouse has no sideways gesture: over the ring, the wheel turns it, one
   * face per notch, so the whole circle is reachable without a trackpad.
   */
  const ring = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ring.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    let collected = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      collected += event.deltaY;
      if (Math.abs(collected) < 40) return;
      const direction = collected > 0 ? 1 : -1;
      collected = 0;
      goTo(mod(state.current.index + direction, geometry.current.count), state.current.turn);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
    // Built once: it reads the wheel through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const face = faces[index];

  return (
    <View style={styles.stageWrap}>
      <View style={styles.middle}>
        <View
          style={[styles.stage, { height: stage }]}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          <View
            ref={ring}
            style={{
              position: 'absolute',
              left: width / 2 - size / 2,
              top: TOP - FACE / 2,
              width: size,
              height: size,
            }}
            {...pan.panHandlers}
          >
            {faces.map((entry, position) => {
              const angle = position * slot;
              const chosen = position === index;
              return (
                <Animated.View
                  key={entry.id}
                  style={[
                    styles.seat,
                    {
                      left: (size - FACE) / 2,
                      top: (size - FACE) / 2,
                      width: FACE,
                      height: FACE,
                      transform: [
                        // Out from the middle, along the rim, then stood up.
                        {
                          rotate: turn.interpolate({
                            inputRange: [-3600, 3600],
                            outputRange: [`${-3600 + angle}deg`, `${3600 + angle}deg`],
                          }),
                        },
                        { translateY: -RADIUS },
                        {
                          rotate: turn.interpolate({
                            inputRange: [-3600, 3600],
                            outputRange: [`${3600 - angle}deg`, `${-3600 - angle}deg`],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => goTo(position, state.current.turn)}
                    accessibilityRole="button"
                    accessibilityLabel={`Face ${entry.name}`}
                    style={({ pressed }) => [
                      styles.face,
                      chosen && styles.chosen,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Bloub shape={entry.shape} color={entry.color} size={FACE} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
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
  middle: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: box(10) },
  // The rest of the ring is out of frame: the stage is the window on it.
  stage: { overflow: 'hidden' },
  seat: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  face: { alignItems: 'center', justifyContent: 'center', opacity: 0.72 },
  chosen: { opacity: 1, transform: [{ scale: 1.3 }] },
  pressed: { opacity: 0.6 },
  name: {
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
