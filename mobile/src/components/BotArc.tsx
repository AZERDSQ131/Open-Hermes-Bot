import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type PanResponderGestureState,
} from 'react-native';
import { Bloub } from './Bloub';
import { GlassSurface } from './GlassButton';
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
const FACE = box(40);

/** Far wider than the sheet: the rim crosses the window almost flat. */
const RADIUS = box(300);

/** How far below the top of the stage the chosen face sits. */
const TOP = box(34);

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
      // Stiff enough to answer at once, damped enough to arrive without a
      // wobble: the wheel comes to rest, it does not bounce.
      stiffness: 150,
      damping: 24,
      mass: 1,
      isInteraction: false,
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
        Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        turn.stopAnimation((value) => {
          base.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        turn.setValue(base.current + gesture.dx * geometry.current.degPerPx);
      },
      // Let go after a flick and the wheel keeps going the way the hand
      // threw it: the speed is read as distance, so a quick pull carries a
      // few faces and a slow one only the nearest.
      onPanResponderRelease: (_, gesture) => drop(gesture, true),
      onPanResponderTerminate: (_, gesture) => drop(gesture, false),
    }),
  ).current;

  function drop(gesture: PanResponderGestureState, flick: boolean) {
    const { slotPx: stepPx, count: total, degPerPx } = geometry.current;
    const travel = gesture.dx + (flick ? gesture.vx * 120 : 0);
    const next = mod(state.current.index - Math.round(travel / stepPx), total);
    goTo(next, base.current + gesture.dx * degPerPx);
  }

  /**
   * A mouse has no sideways gesture: over the ring, the wheel turns it as if
   * it were being pulled, and it settles on the nearest face once the wheel
   * stops. The pull is followed frame by frame, not stepped, so a trackpad
   * reads as one movement.
   */
  const ring = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ring.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    let pulled = 0;
    let from: number | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (from === null) from = state.current.turn;
      pulled += event.deltaY;
      turn.setValue(from + pulled * geometry.current.degPerPx);
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        const { slotPx: stepPx, count: total, degPerPx } = geometry.current;
        const next = mod(state.current.index - Math.round(pulled / stepPx), total);
        goTo(next, (from ?? 0) + pulled * degPerPx);
        pulled = 0;
        from = null;
      }, 120);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (idle) clearTimeout(idle);
      node.removeEventListener('wheel', onWheel);
    };
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
              // How many seats away from the one at the top: 0 is the face
              // that Customize takes, 1 its two neighbours, and the rest
              // fall away in size and in light.
              const away = Math.min(mod(position - index, count), mod(index - position, count));
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
                      away === 0 && styles.chosen,
                      away === 1 && styles.near,
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

      <View style={styles.foot}>
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => face && onCustomize(face)}
          disabled={!face}
          accessibilityRole="button"
          accessibilityLabel="Customize this bot"
        >
          <GlassSurface interactive style={styles.primary} tint={C.paper}>
            <Text style={styles.primaryText}>Customize</Text>
          </GlassSurface>
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
  face: { alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
  near: { opacity: 0.82, transform: [{ scale: 1.12 }] },
  chosen: { opacity: 1, transform: [{ scale: 1.5 }] },
  pressed: { opacity: 0.6 },
  foot: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 10 },
  // A pill of the same glass as the buttons, in the colour it always had.
  primary: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  primaryText: { color: INK.onPaper, fontSize: 14, fontWeight: '600' },
});
