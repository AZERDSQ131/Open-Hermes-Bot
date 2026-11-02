import { Fragment, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  PAIRING_LENGTH,
  normalizePairingCode,
  pairingCodeReady,
} from '../pairing';
import { useStore } from '../store';
import { C, INK, createStyles } from '../theme';

/**
 * The pairing code, as the bridge prints it: two groups of four, a dash
 * between them that the person never has to type. Eight slots show what has
 * been read; one invisible field, over them, is what the keyboard writes
 * into. A pasted `ABCD-EFGH` lands in the same eight slots as eight taps.
 */
export function PairingCode({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const { toggles } = useStore();
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const blink = useRef(new Animated.Value(1)).current;
  const raw = normalizePairingCode(value);
  const ready = pairingCodeReady(raw);
  // The slot the next letter lands in; the last one keeps the caret when the
  // code is whole.
  const active = focused ? Math.min(raw.length, PAIRING_LENGTH - 1) : -1;

  // A caret that sits still reads as a coloured bar; one that breathes reads
  // as a place the next letter will land.
  useEffect(() => {
    if (!focused) {
      blink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, focused]);

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.label}>Pairing code</Text>
        <Text style={[styles.count, ready && styles.countReady]}>
          {ready ? 'Complete' : `${raw.length} / ${PAIRING_LENGTH}`}
        </Text>
      </View>

      <Pressable
        style={[styles.field, focused && styles.fieldFocused]}
        onPress={() => input.current?.focus()}
        accessibilityRole="none"
      >
        <View style={styles.slots} accessible={false} importantForAccessibility="no">
          {Array.from({ length: PAIRING_LENGTH }, (_, index) => {
            const filled = index < raw.length;
            const on = index === active;
            return (
              <Fragment key={index}>
                {index === 4 ? <View style={styles.dash} /> : null}
                <View
                  style={[
                    styles.slot,
                    filled && styles.slotFilled,
                    on && styles.slotActive,
                  ]}
                >
                  {filled ? (
                    <Text style={styles.slotText}>{raw[index]}</Text>
                  ) : on ? (
                    <Animated.View style={[styles.caret, { opacity: blink }]} />
                  ) : (
                    <View style={styles.dot} />
                  )}
                </View>
              </Fragment>
            );
          })}
        </View>

        <TextInput
          ref={input}
          value={raw}
          onChangeText={(text) => {
            const next = normalizePairingCode(text);
            if (next === raw) return;
            if (toggles.haptics) {
              if (next.length === PAIRING_LENGTH && raw.length < PAIRING_LENGTH) {
                void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                ).catch(() => undefined);
              } else if (next.length > raw.length) {
                void Haptics.selectionAsync().catch(() => undefined);
              }
            }
            onChange(next);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => {
            if (ready) onSubmit?.();
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
          returnKeyType="done"
          caretHidden
          selectionColor="transparent"
          style={styles.input}
          accessibilityLabel="Pairing code"
          accessibilityHint="Eight characters, no dash needed"
        />
      </Pressable>

      <Text style={styles.hint}>
        Eight characters, no dash: the four and four land apart on their own.
      </Text>
    </View>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = createStyles({
  root: { marginTop: 10 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingBottom: 5,
  },
  label: { color: '#87878e', fontSize: 9, fontWeight: '500', letterSpacing: 0.4 },
  count: { color: INK.label, fontSize: 8.5, fontVariant: ['tabular-nums'] },
  countReady: { color: C.green },

  field: {
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 13,
    backgroundColor: C.cardRaised,
  },
  fieldFocused: { borderColor: 'rgba(242,239,229,0.32)' },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // The dash is a breath, not a box: the code reads as four, then four.
  dash: { width: 7, height: 1, marginHorizontal: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  slot: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 9,
    backgroundColor: C.card,
  },
  slotFilled: { borderColor: 'rgba(255,255,255,0.13)', backgroundColor: C.bean },
  slotActive: { borderColor: C.paper, backgroundColor: '#34343a' },
  slotText: {
    color: C.text,
    fontFamily: mono,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 21,
  },
  caret: { width: 1.5, height: 17, borderRadius: 1, backgroundColor: C.paper },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  hint: {
    marginTop: 6,
    paddingHorizontal: 5,
    color: '#7c7c83',
    fontSize: 9,
    lineHeight: 13,
  },

  // The field the keyboard writes into: the slots are what a person sees.
  input: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    color: 'transparent',
    opacity: 0.02,
    fontSize: 1,
  },
});
