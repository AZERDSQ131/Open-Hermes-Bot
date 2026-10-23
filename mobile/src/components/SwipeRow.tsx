import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { C, box, createStyles } from '../theme';

/**
 * A row a hand can push aside. One action behind each edge: push right for
 * the left one, push left for the right one. It is a gesture, not a page:
 * the row slides, the app does not.
 *
 * The width is the same number the row travels: the two used to drift apart
 * (one scaled by the theme, one not), so the action ate the face on the left
 * and the hour on the right.
 */
const ACTION = box(84);

export type SwipeAction = {
  label: string;
  /** A mark or a short letter shown above the word. */
  glyph?: string;
  onPress: () => void;
};

type Props = {
  children: ReactNode;
  left?: SwipeAction;
  right?: SwipeAction;
};

export function SwipeRow({ children, left, right }: Props) {
  const slide = useRef(new Animated.Value(0)).current;
  const from = useRef(0);
  const [open, setOpen] = useState<'left' | 'right' | null>(null);
  /** The side whose action is on screen: the one being pulled, or the open one. */
  const [shown, setShown] = useState<'left' | 'right' | null>(null);

  const settle = useMemo(
    () => (to: number, side: 'left' | 'right' | null) => {
      setOpen(side);
      setShown(side);
      Animated.spring(slide, {
        toValue: to,
        useNativeDriver: true,
        speed: 22,
        bounciness: 0,
      }).start();
    },
    [slide],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a sideways push takes the row: a scroll stays a scroll.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
        onPanResponderGrant: () => {
          slide.stopAnimation();
          from.current = open === 'left' ? ACTION : open === 'right' ? -ACTION : 0;
        },
        onPanResponderMove: (_event, gesture) => {
          const raw = from.current + gesture.dx;
          const low = right ? -ACTION : 0;
          const high = left ? ACTION : 0;
          slide.setValue(Math.max(low, Math.min(high, raw)));
          setShown(raw > 0 ? (left ? 'left' : null) : raw < 0 ? (right ? 'right' : null) : null);
        },
        onPanResponderRelease: (_event, gesture) => {
          const at = from.current + gesture.dx;
          if (at > ACTION * 0.55 && left) settle(ACTION, 'left');
          else if (at < -ACTION * 0.55 && right) settle(-ACTION, 'right');
          else settle(0, null);
        },
        onPanResponderTerminate: () => settle(0, null),
      }),
    [left, open, right, settle, slide],
  );

  const action = shown === 'left' ? left : shown === 'right' ? right : undefined;

  return (
    <View style={styles.root}>
      {shown && action ? (
        <View
          style={[
            styles.action,
            { width: ACTION },
            shown === 'left' ? styles.left : styles.right,
          ]}
        >
          <Pressable
            style={styles.actionPress}
            onPress={() => {
              action.onPress();
              settle(0, null);
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            {action.glyph ? <Text style={styles.glyph}>{action.glyph}</Text> : null}
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        </View>
      ) : null}

      <Animated.View style={[styles.content, { transform: [{ translateX: slide }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>

      {open ? (
        <Pressable
          style={[
            styles.catcher,
            {
              left: open === 'left' ? ACTION : 0,
              right: open === 'right' ? ACTION : 0,
            },
          ]}
          onPress={() => settle(0, null)}
          accessibilityLabel="Close the actions"
        />
      ) : null}
    </View>
  );
}

const styles = createStyles({
  root: { overflow: 'hidden', borderRadius: 11 },
  content: { zIndex: 1 },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bean,
  },
  left: { left: 0 },
  right: { right: 0 },
  actionPress: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  glyph: { color: '#f2efe5', fontSize: 15, fontWeight: '600' },
  actionLabel: { color: '#d6d6db', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  catcher: { position: 'absolute', top: 0, bottom: 0, zIndex: 2 },
});
