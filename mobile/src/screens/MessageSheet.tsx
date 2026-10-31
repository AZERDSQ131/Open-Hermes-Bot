import { Pressable, Text, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { SheetHeader } from '../components/UI';
import type { Message } from '../data';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

const EMOJI = ['👍', '❤️', '🎯', '👀'];

/**
 * A tapback on what the bot said. Long press or double tap opens it; the
 * four marks are the round's, and pressing the same one again takes it back.
 *
 * Nothing else is offered: the bot's message is answered, and your own
 * messages are not a place for marks at all.
 */
export function MessageSheet({
  visible,
  onClose,
  threadId,
  message,
}: {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  message: Message | null;
}) {
  const { react } = useStore();

  if (!message || message.from === 'user') return null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader
        title="React"
        sub="A tapback on the bot’s message"
        onClose={onClose}
      />

      <View style={styles.emojiRow}>
        {EMOJI.map((emoji) => (
          <Pressable
            key={emoji}
            style={[styles.emojiButton, message.reaction?.emoji === emoji && styles.emojiOn]}
            onPress={() => {
              react(threadId, message.id, emoji);
              onClose();
            }}
            accessibilityLabel={`React ${emoji}`}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>A tapback lives until the app closes.</Text>
    </Sheet>
  );
}

const styles = createStyles({
  emojiRow: { flexDirection: 'row', gap: 8, paddingTop: 14, paddingHorizontal: 16 },
  emojiButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: C.card,
  },
  emojiOn: { borderWidth: 1, borderColor: C.paper },
  emoji: { fontSize: 20 },
  hint: { marginTop: 12, paddingHorizontal: 16, color: '#7c7c83', fontSize: 10 },
});
