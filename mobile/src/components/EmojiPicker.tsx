import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GlassSurface } from './GlassButton';
import { PrimaryButton } from './UI';
import { createStyles } from '../theme';

/**
 * One mark, from the phone's own keyboard and its emoji page. The field
 * keeps a single grapheme — a family, a flag or a skin tone is one mark —
 * so a slip of the thumb never puts a sentence where an emoji belongs.
 */
function firstEmoji(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (
      locales?: string,
      options?: { granularity: 'grapheme' },
    ) => { segment: (input: string) => Iterable<{ segment: string }> };
  }).Segmenter;
  if (Segmenter) {
    const [first] = new Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    return first?.segment ?? '';
  }
  return Array.from(text)[0] ?? '';
}
export function EmojiPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const [value, setValue] = useState('');
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const emoji = value;

  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  function pick() {
    if (!emoji) return;
    onPick(emoji);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => field.current?.focus()}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <GlassSurface style={styles.card}>
          <Text style={styles.title}>Any emoji</Text>
          <Text style={styles.sub}>The keyboard has its own page for them.</Text>

          <TextInput
            ref={field}
            value={value}
            onChangeText={(next) => setValue(firstEmoji(next))}
            placeholder="🙂"
            placeholderTextColor="#7c7c83"
            style={styles.field}
            autoFocus
            maxLength={8}
            returnKeyType="done"
            onSubmitEditing={pick}
            accessibilityLabel="Emoji"
          />

          <View style={styles.button}>
            <PrimaryButton
              label={emoji ? `React ${emoji}` : 'Type an emoji'}
              onPress={pick}
            />
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = createStyles({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(8,8,10,0.55)',
  },
  card: { width: '100%', maxWidth: 300, padding: 16, borderRadius: 24 },
  title: { color: '#f2f2f4', fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sub: { marginTop: 3, color: '#8e8e95', fontSize: 11 },
  field: {
    height: 54,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#f7f5ee',
    fontSize: 26,
    textAlign: 'center',
  },
  button: { marginTop: 12 },
});
