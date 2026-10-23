import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bloub } from '../components/Bloub';
import { BackIcon, ChevronIcon } from '../components/Icons';
import { Toggle } from '../components/Toggle';
import { HOST } from '../data';
import { useStore } from '../store';
import { useAppNavigation } from '../nav';
import { C, INK, createStyles } from '../theme';

/**
 * Where the host, the conversation and the app are set. Every row opens the
 * page that holds it; the switches live in the store and take effect at once.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { toggles, toggle, prefs, connection } = useStore();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <Pressable style={styles.navIcon} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <BackIcon />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        <Pressable style={styles.connection} onPress={() => navigation.navigate('Connection')}>
          <Bloub shape="cercle" color="#8b5cf6" size={30} />
          <View style={styles.connectionCopy}>
            <Text style={styles.connectionName}>{prefs.host}</Text>
            <Text style={styles.connectionMeta}>
              {connection.status === 'connected'
                ? `Connected · ${connection.device || 'this phone'}`
                : connection.status === 'connecting'
                  ? 'Connecting…'
                  : connection.status === 'error'
                    ? 'Not connected · the bridge refused'
                    : 'Not connected · running the sample'}
            </Text>
          </View>
          <View style={styles.connectionState}>
            <View
              style={[
                styles.stateDot,
                connection.status !== 'connected' && styles.stateDotOff,
              ]}
            />
            <Text style={styles.stateText}>Bridge</Text>
          </View>
          <ChevronIcon />
        </Pressable>

        <Text style={styles.groupLabel}>Hermes</Text>
        <View style={styles.group}>
          <Row
            name="Connection"
            value={connection.status === 'connected' ? 'Connected' : 'Not connected'}
            onPress={() => navigation.navigate('Connection')}
          />
          <Row
            name="Models"
            value={prefs.defaultModel}
            line
            onPress={() => navigation.navigate('Models')}
          />
          <Row
            name="Voice"
            value={prefs.voice === 'host' ? 'Host transcription' : 'On this phone'}
            line
            onPress={() => navigation.navigate('Voice')}
          />
          <Row
            name="Updates"
            value={prefs.autoUpdate ? 'Automatic' : 'Manual'}
            valueColor="#7fcfaa"
            line
            onPress={() => navigation.navigate('Updates')}
          />
        </View>

        <Text style={styles.groupLabel}>Conversation</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowName}>Tapbacks</Text>
            <View style={styles.spacer} />
            <Toggle on={toggles.tapbacks} onChange={() => toggle('tapbacks')} label="Tapbacks" />
          </View>
          <View style={[styles.row, styles.line]}>
            <Text style={styles.rowName}>Sounds</Text>
            <View style={styles.spacer} />
            <Toggle on={toggles.sounds} onChange={() => toggle('sounds')} label="Sounds" />
          </View>
        </View>

        <Text style={styles.groupLabel}>App</Text>
        <View style={styles.group}>
          <Row name="Appearance" value="Dark" onPress={() => navigation.navigate('Appearance')} />
          <View style={[styles.row, styles.line]}>
            <Text style={styles.rowName}>Haptics</Text>
            <View style={styles.spacer} />
            <Toggle
              on={toggles.haptics}
              onChange={() => {
                // The switch answers in the hand when it is turned on.
                if (!toggles.haptics) void Haptics.selectionAsync();
                toggle('haptics');
              }}
              label="Haptics"
            />
          </View>
          <Row
            name="Setup"
            value="Run again"
            line
            onPress={() => navigation.navigate('Setup')}
          />
        </View>

        <Text style={styles.groupLabel}>About</Text>
        <View style={styles.group}>
          <Row name="Version" value={HOST.version} chevron={false} />
          <Row name="Server" value={`Hermes ${HOST.version}`} line chevron={false} />
        </View>

        <Text style={styles.foot}>Hermes Bot · a window onto your host</Text>
      </ScrollView>
    </View>
  );
}

function Row({
  name,
  value,
  line,
  valueColor,
  onPress,
  chevron = true,
}: {
  name: string;
  value: string;
  line?: boolean;
  valueColor?: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable
      style={[styles.row, line && styles.line]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={styles.rowName}>{name}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {onPress && chevron ? <ChevronIcon size={12} /> : null}
    </Pressable>
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

  scroll: { flex: 1 },
  scrollBody: { paddingTop: 13, paddingHorizontal: 12, paddingBottom: 20 },

  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    backgroundColor: C.cardRaised,
  },
  connectionCopy: { flex: 1, gap: 2 },
  connectionName: { color: '#f1f1f3', fontSize: 14, fontWeight: '600', letterSpacing: -0.14 },
  connectionMeta: { color: '#84848b', fontSize: 10 },
  connectionState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stateDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.green },
  stateDotOff: { backgroundColor: INK.label },
  stateText: { color: '#9f9fa6', fontSize: 9 },

  groupLabel: {
    paddingTop: 10,
    paddingHorizontal: 5,
    paddingBottom: 3,
    color: INK.label,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.04,
    textTransform: 'uppercase',
  },
  group: { overflow: 'hidden', borderRadius: 13, backgroundColor: C.cardRaised },
  row: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  line: { borderTopWidth: 1, borderTopColor: C.hairline },
  rowName: { color: '#e9e9ec', fontSize: 12, fontWeight: '500' },
  rowValue: { marginLeft: 'auto', color: '#82828a', fontSize: 11 },
  spacer: { flex: 1 },
  foot: { marginTop: 12, color: '#626269', fontSize: 9, textAlign: 'center' },
});
