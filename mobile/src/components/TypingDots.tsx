import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { createStyles } from '../theme';

/**
 * The three dots of a bot still thinking. Each one rises on its own beat,
 * and the loop is the same length for the three of them, so it breathes
 * rather than stutters.
 */
export function TypingDots() {
  const one = useRef(new Animated.Value(0.32)).current;
  const two = useRef(new Animated.Value(0.32)).current;
  const three = useRef(new Animated.Value(0.32)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, index: number) =>
      Animated.sequence([
        Animated.delay(index * 150),
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.32, duration: 300, useNativeDriver: true }),
        Animated.delay(300 - index * 150),
      ]);

    const loop = Animated.loop(
      Animated.parallel([pulse(one, 0), pulse(two, 1), pulse(three, 2)]),
    );
    loop.start();
    return () => loop.stop();
  }, [one, three, two]);

  return (
    <View style={styles.row}>
      {[one, two, three].map((dot, index) => (
        <Animated.View key={index} style={[styles.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

const styles = createStyles({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2.5 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#8d8d94' },
});
