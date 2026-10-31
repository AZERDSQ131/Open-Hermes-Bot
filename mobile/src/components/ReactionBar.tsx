import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { GlassSurface } from './GlassButton';
import { createStyles } from '../theme';

/** The marks a bubble answers to, the same the round uses. */
export const TAPBACKS = ['👍', '❤️', '😂', '😮', '🎯', '👀'] as const;

/**
 * The little strip of reactions that opens over a message, the way a thumb
 * expects it: a capsule above the bubble, not a sheet over the conversation.
 *
 * It springs into place rather than appearing. Only the transform is
 * animated: the glass itself must stay at full opacity for UIKit to draw it.
 */
export function ReactionBar({
  onPick,
  onMore,
  selected,
}: {
  onPick: (emoji: string) => void;
  onMore: () => void;
  selected?: string;
}) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [pop]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
          },
          {
            translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }),
          },
        ],
      }}
    >
      <GlassSurface style={styles.bar}>
        {TAPBACKS.map((emoji) => {
          const on = selected === emoji;
          return (
            <Pressable
              key={emoji}
              style={[styles.mark, on && styles.markOn]}
              onPress={() => onPick(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
              accessibilityState={{ selected: on }}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={styles.mark}
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel="Pick another emoji"
        >
          <Text style={styles.more}>+</Text>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = createStyles({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    padding: 4,
    borderRadius: 999,
  },
  mark: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  markOn: { backgroundColor: 'rgba(242,239,229,0.18)' },
  emoji: { fontSize: 16 },
  more: { color: '#f2efe5', fontSize: 20, fontWeight: '400', lineHeight: 24 },
});
