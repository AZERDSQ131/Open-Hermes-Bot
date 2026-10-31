import type { ReactNode } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { C, createStyles } from '../theme';

/**
 * A round control made of liquid glass.
 *
 * On iOS 26 it is the system's own glass: `GlassView` with `isInteractive`,
 * so it swells under the finger like every other glass control, and it clips
 * itself through its borderRadius (never put `overflow: hidden` around it —
 * that cuts the rim light off). Below iOS 26 the pane is not drawn at all,
 * so the button keeps the flat face it had before.
 *
 * Two of them close together belong in a `GlassButtonGroup`: the container
 * lets neighbouring panes melt into one when they are near, which is what
 * makes a pair of buttons read as one piece of glass.
 */

const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

export function GlassButtonGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!LIQUID) return <View style={style}>{children}</View>;
  return (
    <GlassContainer spacing={12} style={style}>
      {children}
    </GlassContainer>
  );
}

export function GlassButton({
  label,
  onPress,
  children,
  size = 36,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  size?: number;
}) {
  const radius = size / 2;
  const box = { width: size, height: size, borderRadius: radius };

  const face = (
    <Pressable
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );

  if (!LIQUID) {
    return (
      <Pressable
        style={({ pressed }) => [styles.solid, box, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <GlassView
      isInteractive
      glassEffectStyle="regular"
      colorScheme="dark"
      tintColor="rgba(42,42,48,0.35)"
      style={box}
    >
      {face}
    </GlassView>
  );
}

const styles = createStyles({
  press: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  solid: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: C.field,
  },
});
