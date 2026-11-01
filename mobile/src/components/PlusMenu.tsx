import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { Bloub, BloubGroup } from './Bloub';
import { GlassSurface } from './GlassButton';
import { C, INK, createStyles } from '../theme';

/**
 * The small menu the plus opens: a bot, or a group, and nothing else.
 *
 * It hangs off the button it came from — one line below, flushed with the
 * button's right edge — so the choice reads as that button's own drawer and
 * not as a sheet rising from the bottom of the window. Picking a row is what
 * opens the sheet; the scrim under it goes away on a tap, anywhere.
 */
const FADE_IN = 150;
const FADE_OUT = 110;
const RISE = 6;

/** Where the card hangs, in window points. */
type Anchor = { top: number; right: number };

export function PlusMenu({
  open,
  anchor,
  onClose,
  onPick,
}: {
  open: boolean;
  anchor: Anchor | null;
  onClose: () => void;
  onPick: (mode: 'bot' | 'group') => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  // The menu has to outlive `open` by the length of the fade out, and the
  // anchor it was measured at has to survive it too: the caller lets go of
  // both at once.
  const [resting, setResting] = useState<Anchor | null>(null);

  useEffect(() => {
    if (open) {
      if (anchor) setResting(anchor);
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: FADE_IN,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: FADE_OUT,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [anchor, open, progress]);

  if (!mounted || !resting) return null;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Pressable style={styles.scrimPress} onPress={onClose} accessibilityLabel="Close">
        <Animated.View style={[styles.scrim, { opacity: progress }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.wrap,
          {
            top: resting.top,
            right: resting.right,
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-RISE, 0],
                }),
              },
            ],
          },
        ]}
      >
        <GlassSurface style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => onPick('bot')}
            accessibilityRole="button"
            accessibilityLabel="Create a new bot"
          >
            <Bloub shape="capsule" color="#9a9aa1" size={20} />
            <View style={styles.copy}>
              <Text style={styles.name}>Create a new bot</Text>
              <Text style={styles.meta}>Its own memory and session</Text>
            </View>
          </Pressable>

          <View style={styles.line} />

          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => onPick('group')}
            accessibilityRole="button"
            accessibilityLabel="Create a new group"
          >
            <BloubGroup
              members={[
                { shape: 'capsule', color: '#8b5cf6' },
                { shape: 'cercle', color: C.green },
                { shape: 'squircle', color: C.blue },
              ]}
              size={20}
            />
            <View style={styles.copy}>
              <Text style={styles.name}>Create a new group</Text>
              <Text style={styles.meta}>A few bots, one conversation</Text>
            </View>
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = createStyles({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrimPress: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { flex: 1, backgroundColor: 'rgba(8,8,10,0.34)' },
  wrap: {
    position: 'absolute',
    width: 224,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  card: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  pressed: { opacity: 0.6 },
  copy: { flex: 1 },
  name: { color: INK.title, fontSize: 12.5, fontWeight: '500', letterSpacing: -0.1 },
  meta: { marginTop: 1, color: INK.meta, fontSize: 9.5 },
  line: { height: 1, backgroundColor: C.hairline },
});
