import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Page } from '../components/Page';
import { Card, Hint, PrimaryButton, Row, SectionLabel } from '../components/UI';
import { Toggle } from '../components/Toggle';
import { HOST } from '../data';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

type Check = 'idle' | 'checking' | 'current';

/**
 * The version, and the look for the next one. The check is simulated: the
 * app looks at nothing, and no build is downloaded.
 */
export function UpdatesScreen() {
  const { prefs, setPref } = useStore();
  const [check, setCheck] = useState<Check>('idle');

  useEffect(() => {
    if (check !== 'checking') return;
    const timer = setTimeout(() => setCheck('current'), 1100);
    return () => clearTimeout(timer);
  }, [check]);

  const word =
    check === 'checking' ? 'Looking…' : check === 'current' ? 'Up to date' : 'Not checked yet';

  return (
    <Page title="Updates">
      <ScrollView contentContainerStyle={styles.body}>
        <SectionLabel>This app</SectionLabel>
        <Card>
          <Row name="Version" value={HOST.version} chevron={false} />
          <View style={styles.line} />
          <Row name="Server" value={`Hermes ${HOST.version}`} chevron={false} />
          <View style={styles.line} />
          <Row
            name="State"
            value={word}
            valueColor={check === 'current' ? '#7fcfaa' : undefined}
            chevron={false}
          />
        </Card>

        <View style={styles.buttons}>
          <PrimaryButton
            label={check === 'checking' ? 'Checking…' : 'Check for updates'}
            onPress={() => setCheck('checking')}
          />
        </View>

        <SectionLabel>When there is one</SectionLabel>
        <Card>
          <Row
            name="Download in the background"
            meta="The app takes over when it is closed"
            chevron={false}
            right={
              <Toggle
                on={prefs.autoUpdate}
                onChange={() => setPref('autoUpdate', !prefs.autoUpdate)}
                label="Automatic updates"
              />
            }
          />
        </Card>

        <Hint>
          Simulated: nothing is fetched and no version is installed. The desktop app is the one
          that owns Squirrel and the release feed.
        </Hint>
      </ScrollView>
    </Page>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingBottom: 24 },
  line: { height: 1, backgroundColor: C.hairline },
  buttons: { marginTop: 16 },
});
