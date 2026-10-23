import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Page } from '../components/Page';
import { Card, Hint, Row, SectionLabel, Segmented } from '../components/UI';
import { useStore } from '../store';
import { C, INK, createStyles } from '../theme';

/**
 * Where a dictation becomes words. Both answers are simulated: nothing is
 * recorded and no audio leaves the phone either way.
 */
export function VoiceScreen() {
  const { prefs, setPref } = useStore();

  return (
    <Page title="Voice">
      <ScrollView contentContainerStyle={styles.body}>
        <SectionLabel>Transcription</SectionLabel>
        <Card>
          <View style={styles.card}>
            <Segmented
              options={[
                { id: 'host' as const, label: 'Hermes host' },
                { id: 'device' as const, label: 'On this phone' },
              ]}
              value={prefs.voice}
              onChange={(voice) => setPref('voice', voice)}
            />
            <Text style={styles.note}>
              {prefs.voice === 'host'
                ? 'Transcribed by your Hermes host · nothing leaves the machine'
                : 'Transcribed on this device · nothing leaves the phone'}
            </Text>
          </View>
        </Card>

        <SectionLabel>What it means</SectionLabel>
        <Card>
          <Row name="Host" meta="The machine running Hermes hears the note" chevron={false} />
          <View style={styles.line} />
          <Row name="Device" meta="The phone transcribes it, the host never sees audio" chevron={false} />
        </Card>

        <Hint>
          The dictation of this demo counts the seconds and posts a voice note; no microphone is
          opened and no audio is requested.
        </Hint>

        <SectionLabel>Language</SectionLabel>
        <Card>
          <Row name="Follows the host" value="English" chevron={false} />
        </Card>
      </ScrollView>
    </Page>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingBottom: 24 },
  card: { padding: 12 },
  note: { marginTop: 10, color: INK.quiet, fontSize: 10, textAlign: 'center' },
  line: { height: 1, backgroundColor: C.hairline },
});
