import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bloub } from './Bloub';
import { PlusIcon } from './Icons';
import { INK, createStyles } from '../theme';

/**
 * The first run: the host is there, the bots are not. One face, one
 * sentence, and the one button that makes the app worth opening.
 */
export function FirstRunBody({
  onCreate,
  onSetup,
}: {
  onCreate: () => void;
  onSetup?: () => void;
}) {
  return (
    <View style={styles.body}>
      <Bloub shape="cercle" color="#8b5cf6" size={86} />
      <Text style={styles.title}>No bots yet</Text>
      <Text style={styles.copy}>
        Your host is connected. Create the first bot and Hermes keeps its memory, its face, and
        its sessions.
      </Text>
      <Pressable style={styles.primary} onPress={onCreate}>
        <PlusIcon size={15} color="#1b1b19" />
        <Text style={styles.primaryText}>Create a bot</Text>
      </Pressable>
      <Pressable onPress={onSetup} accessibilityRole="button" disabled={!onSetup}>
        <Text style={[styles.link, !onSetup && styles.linkOff]}>Run the setup again</Text>
      </Pressable>
    </View>
  );
}

const styles = createStyles({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 30,
  },
  title: { marginTop: 17, color: '#f2f2f4', fontSize: 21, fontWeight: '600', letterSpacing: -0.59 },
  copy: {
    maxWidth: 245,
    marginTop: 7,
    marginBottom: 20,
    color: INK.quiet2,
    fontSize: 12,
    lineHeight: 18.5,
    textAlign: 'center',
  },
  primary: {
    width: 214,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: '#f2efe5',
  },
  primaryText: { color: '#1b1b19', fontSize: 14, fontWeight: '600' },
  link: { marginTop: 13, color: '#8f8f96', fontSize: 11 },
  linkOff: { opacity: 0.5 },
});
