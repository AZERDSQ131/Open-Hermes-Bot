import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  View,
  type DimensionValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, createStyles } from '../theme';

/**
 * A sheet that covers the bottom of the window: the create form, the model
 * picker, the group details. Same grabber, same radius, same scrim as the
 * mockup.
 *
 * It does not travel: it is already where it belongs, and the dim under it
 * comes up while the sheet fades in. Nothing slides.
 *
 * The dim is the part that must feel immediate: it darkens two and a half
 * times faster than the sheet itself, so the room goes quiet before the
 * panel is legible.
 */
const FADE_IN = 420;
const FADE_OUT = 200;
const DIM_IN = Math.round(FADE_IN / 2.5);
const DIM_OUT = Math.round(FADE_OUT / 2.5);

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** The most of the window a sheet may take: it fits its content below that. */
  height?: DimensionValue;
};

export function Sheet({ visible, onClose, children, height = '90%' }: SheetProps) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(0)).current;
  // The modal has to outlive `visible` by the length of the fade out, and so
  // does what it holds: the caller lets go of its content at once.
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState<ReactNode>(children);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(dim, {
          toValue: 1,
          duration: DIM_IN,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: FADE_IN,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(dim, {
        toValue: 0,
        duration: DIM_OUT,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_OUT,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [dim, fade, visible]);

  useEffect(() => {
    if (visible) setContent(children);
  }, [children, visible]);

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.scrimPress} onPress={onClose} accessibilityLabel="Close">
          <Animated.View style={[styles.scrim, { opacity: dim }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            { opacity: fade, maxHeight: height, paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <Animated.View style={styles.grabber} />
          {content}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = createStyles({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrimPress: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(8,8,10,0.62)',
  },
  sheet: {
    marginHorizontal: 5,
    marginBottom: 5,
    paddingTop: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 27,
    backgroundColor: C.sheet,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
  },
  grabber: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4c4c52',
    alignSelf: 'center',
    marginTop: 7,
  },
});
