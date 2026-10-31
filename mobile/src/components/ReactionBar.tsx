import { Pressable, Text } from 'react-native';
import { GlassSurface } from './GlassButton';
import { createStyles } from '../theme';

/** The four marks a bubble answers to, the same the round uses. */
export const TAPBACKS = ['👍', '❤️', '🎯', '👀'] as const;

/**
 * The little strip of reactions that opens over a message, the way a thumb
 * expects it: a capsule above the bubble, not a sheet over the conversation.
 */
export function ReactionBar({
  onPick,
  selected,
}: {
  onPick: (emoji: string) => void;
  selected?: string;
}) {
  return (
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
    </GlassSurface>
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
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  markOn: { backgroundColor: 'rgba(242,239,229,0.18)' },
  emoji: { fontSize: 17 },
});
