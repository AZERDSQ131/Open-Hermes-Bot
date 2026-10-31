import { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { GlassSurface } from './GlassButton';
import { C, box, createStyles } from '../theme';

const TRACK = box(38);
const KNOB = box(19);
const PAD = box(2);
const TRAVEL = TRACK - KNOB - PAD * 2;

/** The green switch of the settings: 38 by 23, the knob on its side. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  const at = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(at, {
      toValue: on ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: 5,
    }).start();
  }, [at, on]);

  // The track is a pane of glass; the green comes up inside it when it is on.
  const green = at.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const translateX = at.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });

  return (
    <Pressable
      onPress={onChange}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <GlassSurface style={styles.track}>
        <Animated.View style={[styles.fill, { opacity: green }]} />
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </GlassSurface>
    </Pressable>
  );
}

const styles = createStyles({
  track: { width: 38, height: 23, borderRadius: 12 },
  fill: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 11,
    backgroundColor: C.green,
  },
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
