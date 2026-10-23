import { ScrollView, StyleSheet } from 'react-native';
import { Page } from '../components/Page';
import { Card, Hint, Row, SectionLabel } from '../components/UI';
import { useStore } from '../store';
import { createStyles } from '../theme';

/**
 * How the app looks. The theme is dark by construction — the palette is the
 * window's own — and a page replaces the one before it without a transition,
 * so there is no motion left to switch off.
 */
export function AppearanceScreen() {
  const { toggles } = useStore();

  return (
    <Page title="Appearance">
      <ScrollView contentContainerStyle={styles.body}>
        <SectionLabel>Theme</SectionLabel>
        <Card>
          <Row name="Dark" value="Only" chevron={false} />
        </Card>
        <Hint>
          Hermes Bot is dark by construction, in the window and on the phone: the same charcoal,
          the same paper bubble. No light theme exists to pick.
        </Hint>

        <SectionLabel>Haptics</SectionLabel>
        <Card>
          <Row name="Follows the App switch" value={toggles.haptics ? 'On' : 'Off'} chevron={false} />
        </Card>
      </ScrollView>
    </Page>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingBottom: 24 },
});
