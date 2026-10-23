import { ScrollView, StyleSheet, View } from 'react-native';
import { Page } from '../components/Page';
import { ModelList } from '../components/ModelList';
import { Card, Hint, Row, SectionLabel } from '../components/UI';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

/**
 * The model a new conversation starts on. A conversation can still be moved
 * to another one from its own details; the bot's memory is untouched either
 * way.
 */
export function ModelsScreen() {
  const { prefs, setPref } = useStore();

  return (
    <Page title="Models">
      <ScrollView contentContainerStyle={styles.body}>
        <SectionLabel>New conversations</SectionLabel>
        <Card>
          <Row name="Default model" value={prefs.defaultModel} chevron={false} />
        </Card>

        <SectionLabel>All models</SectionLabel>
        <View style={styles.list}>
          <ModelList selected={prefs.defaultModel} onPick={(picked) => setPref('defaultModel', picked)} />
        </View>

        <Hint>
          The list is the host's, in the mockup's words. Choosing here only sets where the next
          conversation starts.
        </Hint>
      </ScrollView>
    </Page>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingBottom: 24 },
  list: { height: 420, borderRadius: 13, backgroundColor: C.cardRaised, overflow: 'hidden', paddingTop: 2 },
});
