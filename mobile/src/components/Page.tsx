import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon } from './Icons';
import { useAppNavigation } from '../nav';
import { C, createStyles } from '../theme';

/**
 * A page pushed from the settings: the way back, its name, and nothing else
 * above the content.
 */
export function Page({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <Pressable
          style={styles.navIcon}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back"
        >
          <BackIcon />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>{right}</View>
      </View>
      {children}
    </View>
  );
}

const styles = createStyles({
  root: { flex: 1, backgroundColor: C.bg },
  nav: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  navIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  title: { color: C.text, fontSize: 14, fontWeight: '600', letterSpacing: -0.17 },
  right: { width: 30, alignItems: 'flex-end' },
});
