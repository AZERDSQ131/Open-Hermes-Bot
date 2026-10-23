import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Sheet } from '../components/Sheet';
import { Hint, Row, SheetHeader } from '../components/UI';
import { CopyIcon, TrashIcon } from '../components/Icons';
import type { Message } from '../data';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

const EMOJI = ['👍', '❤️', '🎯', '👀'];

/**
 * What a hand can do to a bubble: a tapback, a copy, or nothing at all. The
 * tapback is the same four the round uses; pressing it again takes it back.
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
  const { react, removeMessage } = useStore();
  const [copied, setCopied] = useState(false);

  if (!message) return null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader
        title="Message"
        sub={message.from === 'user' ? 'Yours' : 'The bot’s'}
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

      <View style={styles.actions}>
        <Row
          name={copied ? 'Copied' : 'Copy the text'}
          chevron={false}
          onPress={async () => {
            await Clipboard.setStringAsync(message.text);
            setCopied(true);
          }}
          right={<CopyIcon />}
        />
        <View style={styles.line} />
        <Row
          name="Delete"
          chevron={false}
          onPress={() => {
            removeMessage(threadId, message.id);
            onClose();
          }}
          right={<TrashIcon />}
        />
      </View>

      <View style={styles.hint}>
        <Hint>Nothing is stored: a tapback and a delete live until the app closes.</Hint>
      </View>
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
  actions: { marginTop: 14, marginHorizontal: 12, borderRadius: 13, backgroundColor: C.cardRaised, overflow: 'hidden' },
  line: { height: 1, backgroundColor: C.hairline },
  hint: { paddingHorizontal: 16 },
});
