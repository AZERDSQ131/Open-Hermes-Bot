import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Page } from '../components/Page';
import { Bloub } from '../components/Bloub';
import { Card, Field, Hint, PrimaryButton, Row, SectionLabel } from '../components/UI';
import { COLORS, SHAPES } from '../data';
import type { BloubShape } from '../bloubFrames';
import { useStore } from '../store';
import { useAppNavigation } from '../nav';
import { C, INK, createStyles } from '../theme';

/**
 * The setup, walked by hand: pair the phone with the bridge, then make the
 * first bot. A bot made here is a Hermes profile, on the host; without a
 * bridge, it is the app's own, until the window closes.
 */
export function SetupScreen() {
  const navigation = useAppNavigation();
  const { prefs, connection, addBot } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Atlas');
  const [shape, setShape] = useState<BloubShape>('capsule');
  const [color, setColor] = useState(COLORS[0]);

  const ready = name.trim().length > 0;

  return (
    <Page title="Setup">
      <View style={styles.progress}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.pip, index <= step && styles.pipOn]} />
        ))}
      </View>

      {step === 0 ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>The setup · 1 of 3</Text>
          <Text style={styles.title}>Connect your Hermes.</Text>
          <Text style={styles.lead}>The bridge on the host, and a code for this phone.</Text>

          <SectionLabel>Connection</SectionLabel>
          <Card>
            <View style={styles.card}>
              <Row
                name="Bridge"
                value={connection.status === 'connected' ? prefs.host : 'Not connected'}
                onPress={() => navigation.navigate('Connection')}
              />
            </View>
          </Card>

          <View style={styles.buttons}>
            <PrimaryButton
              label={
                connection.status === 'connected'
                  ? 'Continue'
                  : 'Open the connection page'
              }
              onPress={() =>
                connection.status === 'connected'
                  ? setStep(1)
                  : navigation.navigate('Connection')
              }
            />
          </View>
          <Hint>
            Nothing about the conversation is kept on the phone. The bridge hands out a token;
            the Hermes keys stay on the host.
          </Hint>
        </ScrollView>
      ) : null}

      {step === 1 ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Your first bot · 2 of 3</Text>
          <Text style={styles.title}>What is it called?</Text>
          <Text style={styles.lead}>The name you will call it by.</Text>

          <View style={styles.preview}>
            <Bloub shape={shape} color={color} size={64} />
            <View style={styles.nameField}>
              <Field label="Bot name" value={name} onChange={setName} placeholder="Atlas" />
            </View>
          </View>

          <SectionLabel>Shape</SectionLabel>
          <View style={styles.shapeGrid}>
            {SHAPES.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.shape, shape === option.id && styles.shapeOn]}
                onPress={() => setShape(option.id)}
                accessibilityLabel={option.label}
              >
                <Bloub shape={option.id} color="#9a9aa2" size={22} />
              </Pressable>
            ))}
          </View>

          <SectionLabel>Colour</SectionLabel>
          <View style={styles.colors}>
            {COLORS.map((dot) => (
              <Pressable
                key={dot}
                onPress={() => setColor(dot)}
                style={[styles.dot, { backgroundColor: dot }, color === dot && styles.dotOn]}
                accessibilityLabel={`Colour ${dot}`}
              />
            ))}
          </View>

          <View style={styles.buttons}>
            <PrimaryButton
              label={ready ? 'Create the bot' : 'Give it a name'}
              onPress={() => {
                if (!ready) return;
                addBot({ name, shape, color, model: prefs.defaultModel });
                setStep(2);
              }}
            />
            <View style={styles.gap} />
            <PrimaryButton label="Back" tone="quiet" onPress={() => setStep(0)} />
          </View>
        </ScrollView>
      ) : null}

      {step === 2 ? (
        <View style={[styles.body, styles.done]}>
          <Bloub shape={shape} color={color} size={86} />
          <Text style={styles.doneTitle}>All set.</Text>
          <Text style={styles.doneCopy}>
            {name || 'Your bot'} is on {prefs.host}. Hermes keeps its memory, its face, and its
            sessions.
          </Text>
          <View style={styles.buttons}>
            <PrimaryButton label="Open the app" onPress={() => navigation.navigate('Chats')} />
            <View style={styles.gap} />
            <PrimaryButton label="Walk it again" tone="quiet" onPress={() => setStep(0)} />
          </View>
        </View>
      ) : null}
    </Page>
  );
}

const styles = createStyles({
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  pip: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#333338' },
  pipOn: { backgroundColor: C.paper },
  body: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24 },
  eyebrow: {
    color: '#6f6f76',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.04,
    textTransform: 'uppercase',
  },
  title: { marginTop: 6, color: C.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.8 },
  lead: { marginTop: 4, color: INK.quiet, fontSize: 12 },
  card: { padding: 12 },
  label: { marginTop: 10, marginBottom: 3, color: '#87878e', fontSize: 9, fontWeight: '500' },
  buttons: { marginTop: 16 },
  gap: { height: 8 },

  preview: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  nameField: { flex: 1 },
  shapeGrid: { flexDirection: 'row', gap: 4 },
  shape: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: C.card,
  },
  shapeOn: { backgroundColor: '#38383e', borderWidth: 1, borderColor: 'rgba(242,239,229,0.55)' },
  colors: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  dotOn: { borderWidth: 2, borderColor: C.paper },

  done: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  doneTitle: { marginTop: 16, color: C.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  doneCopy: {
    marginTop: 6,
    marginBottom: 4,
    maxWidth: 260,
    color: INK.quiet,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
