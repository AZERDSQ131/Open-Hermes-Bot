import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Sheet } from '../components/Sheet';
import { Bloub } from '../components/Bloub';
import { BotArc } from '../components/BotArc';
import { GlassButton, GlassSurface } from '../components/GlassButton';
import { BackIcon, ChevronIcon, CloseIcon } from '../components/Icons';
import { ModelList } from '../components/ModelList';
import { COLORS, DEFAULT_MODEL, SHAPES, HOST } from '../data';
import { suggestFaces, type Suggested } from '../faces';
import type { BloubShape } from '../bloubFrames';
import { useStore } from '../store';
import { C, INK, box, createStyles } from '../theme';

/**
 * The create sheet. A bot keeps its own memory, its own session, and the
 * face picked here; a group brings a few of them into one conversation,
 * each with its session untouched.
 *
 * Which of the two it is was decided before the sheet opened — by the plus's
 * small menu — so the sheet asks only what that choice still leaves open.
 *
 * A bot is made in two steps: the arc offers faces drawn at random, and the
 * one that is kept fills the form below. The form is the same page it always
 * was, only pre-filled — Back returns to the arc without losing the name.
 */
export function NewAgentSheet({
  visible,
  mode,
  onClose,
  onCreated,
}: {
  visible: boolean;
  /** The kind chosen on the way in: the sheet never changes it. */
  mode?: 'bot' | 'group';
  onClose: () => void;
  onCreated?: (threadId: string) => void;
}) {
  const { bots, prefs, addBot, addGroup } = useStore();
  const window = useWindowDimensions();
  const tab = mode ?? 'bot';
  const [step, setStep] = useState<'faces' | 'form'>('faces');
  // The two steps do not ask for the same room. The sheet is pinned to the
  // bottom of the window, so growing it is the panel rising: Customize lifts
  // the popup, Back lets it settle again.
  const short = Math.round(window.height * 0.52);
  const tall = Math.round(window.height * 0.74);
  const picking = Math.round(window.height * 0.64);
  const grow = useRef(new Animated.Value(short)).current;
  const [faces, setFaces] = useState<Suggested[]>([]);
  const [name, setName] = useState('Atlas');
  const [shape, setShape] = useState<BloubShape>('capsule');
  const [color, setColor] = useState(COLORS[0]);
  const [model, setModel] = useState(prefs.defaultModel);
  const [pickingModel, setPickingModel] = useState(false);
  const [members, setMembers] = useState<string[]>(['atlas', 'june', 'chief']);

  // Every opening starts from a fresh arc: the faces are drawn, not kept.
  useEffect(() => {
    if (!visible) return;
    const first = tab === 'bot' ? 'faces' : 'form';
    setStep(first);
    grow.setValue(first === 'form' ? tall : short);
    setPickingModel(false);
    if (tab === 'bot') setFaces(suggestFaces());
  }, [grow, short, tab, tall, visible]);

  useEffect(() => {
    const target = pickingModel ? picking : step === 'form' ? tall : short;
    Animated.timing(grow, {
      toValue: target,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      // A height is a layout property: no native driver can carry it.
      useNativeDriver: false,
    }).start();
  }, [grow, picking, pickingModel, short, step, tall]);

  const ready = name.trim().length > 0 && (tab === 'bot' || members.length > 1);

  function customize(face: Suggested) {
    setName(face.name);
    setShape(face.shape);
    setColor(face.color);
    setStep('form');
  }

  function create() {
    if (!ready) return;
    const id =
      tab === 'bot'
        ? addBot({ name, shape, color, model })
        : addGroup({ name: name || 'Crew', members, model });
    onClose();
    onCreated?.(id);
  }

  function leave() {
    if (pickingModel) setPickingModel(false);
    else if (tab === 'bot' && step === 'form') setStep('faces');
    else onClose();
  }

  /**
   * One step, whole: its title, its way back, and what it asks for. It is a
   * function because two of them are on screen at once while they trade
   * places — the one arriving, and the one leaving.
   */
  function stepPane(which: 'faces' | 'form') {
    const arc = tab === 'bot' && which === 'faces' && !pickingModel;
    const canBack = pickingModel || (tab === 'bot' && which === 'form');

    return (
      <>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Text style={styles.title}>
              {pickingModel ? 'Model' : arc ? 'Create a bot' : tab === 'bot' ? 'New bot' : 'New group'}
            </Text>
            <Text style={styles.sub}>
              {pickingModel
                ? 'For this conversation only. The bot keeps its memory.'
                : arc
                  ? 'Fresh faces every time. Stop on one, then make it yours.'
                  : tab === 'bot'
                    ? 'Its own memory, its own session, and the face you pick.'
                    : 'Brings bots together in one conversation, each with its session.'}
            </Text>
          </View>
          <GlassButton size={box(26)} label={canBack ? 'Back' : 'Close'} onPress={leave}>
            {canBack ? <BackIcon size={15} color="#e9e9ed" /> : <CloseIcon color="#e9e9ed" />}
          </GlassButton>
        </View>

        {pickingModel ? (
          <View style={[styles.picker, { height: Math.round(window.height * 0.45) }]}>
            <ModelList
              selected={model}
              onPick={(picked) => {
                setModel(picked);
                setPickingModel(false);
              }}
            />
          </View>
        ) : arc ? (
          <BotArc faces={faces} onCustomize={customize} />
        ) : (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
              <View style={styles.preview}>
                <Bloub shape={shape} color={color} size={56} />
                <View style={styles.nameField}>
                  <Text style={styles.fieldLabel}>{tab === 'bot' ? 'Bot name' : 'Group name'}</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    style={styles.fieldValue}
                    placeholder="Name"
                    placeholderTextColor="#87878e"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
              </View>
              <Text style={styles.hint}>
                {tab === 'bot'
                  ? `Creates the Hermes profile “${name.toLowerCase().replace(/\s+/g, '-') || 'bot'}” on ${HOST.name}.`
                  : 'Every member answers on its own, and can @ another to hand over the floor.'}
              </Text>

              {tab === 'bot' ? (
                <>
                  <View style={styles.section}>
                    <Text style={styles.label}>Shape</Text>
                    <View style={styles.shapeGrid}>
                      {SHAPES.map((option) => (
                        <Pressable
                          key={option.id}
                          style={[styles.shapeOption, shape === option.id && styles.shapeActive]}
                          onPress={() => setShape(option.id)}
                          accessibilityLabel={option.label}
                        >
                          <Bloub shape={option.id} color="#9a9aa2" size={22} />
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>Color</Text>
                    <View style={styles.colorGrid}>
                      {COLORS.map((dot) => (
                        <Pressable
                          key={dot}
                          onPress={() => setColor(dot)}
                          style={[
                            styles.dot,
                            { backgroundColor: dot },
                            color === dot && styles.dotActive,
                          ]}
                          accessibilityLabel={`Colour ${dot}`}
                        />
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.section}>
                  <Text style={styles.label}>Members</Text>
                  <View style={styles.card}>
                    {bots.map((bot, index) => {
                      const on = members.includes(bot.id);
                      return (
                        <Pressable
                          key={bot.id}
                          style={[styles.row, index > 0 && styles.rowLine]}
                          onPress={() =>
                            setMembers((current) =>
                              current.includes(bot.id)
                                ? current.filter((id) => id !== bot.id)
                                : [...current, bot.id],
                            )
                          }
                        >
                          <Bloub shape={bot.shape} color={bot.color} size={26} />
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowName}>{bot.name}</Text>
                            <Text style={styles.rowMeta}>{bot.role} · session {bot.session}</Text>
                          </View>
                          <View style={[styles.check, on && styles.checkOn]}>
                            {on ? <Text style={styles.checkMark}>✓</Text> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.label}>Model</Text>
                <View style={styles.card}>
                  <Pressable style={styles.row} onPress={() => setPickingModel(true)}>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName}>{model}</Text>
                      <Text style={styles.rowMeta}>Anthropic · default</Text>
                    </View>
                    <ChevronIcon />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.hint}>
                {tab === 'bot'
                  ? 'The bot keeps its own memory, its own session, and the face you picked.'
                  : 'Each member keeps its own session, and can @ another to hand over the floor.'}
              </Text>
            </ScrollView>

            <View style={styles.foot}>
              <Pressable
                style={({ pressed }) => [(!ready || pressed) && styles.primaryOff]}
                onPress={create}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel={tab === 'bot' ? 'Create bot' : 'Create group'}
              >
                <GlassSurface interactive style={styles.primary} tint={C.paper}>
                  <Text style={styles.primaryText}>
                    {tab === 'bot' ? 'Create bot' : 'Create group'}
                  </Text>
                </GlassSurface>
              </Pressable>
            </View>
          </>
        )}
      </>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
    >
      <Animated.View style={[styles.pane, { height: grow }]}>{stepPane(step)}</Animated.View>
    </Sheet>
  );
}

const styles = createStyles({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 12, paddingHorizontal: 16 },
  headCopy: { flex: 1 },
  title: { color: C.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.48 },
  sub: { marginTop: 3, color: '#8a8a91', fontSize: 11, lineHeight: 15 },

  pane: { overflow: 'hidden' },
  body: { flexShrink: 1, flexGrow: 1 },
  picker: { flexShrink: 1 },
  bodyContent: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 },

  preview: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14 },
  nameField: { flex: 1 },
  fieldLabel: { color: '#87878e', fontSize: 9, fontWeight: '500' },
  fieldValue: {
    height: 34,
    marginTop: 3,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 9,
    backgroundColor: C.card,
    color: C.text,
    fontSize: 14,
    fontWeight: '500',
  },
  hint: { marginTop: 7, color: '#7c7c83', fontSize: 10, lineHeight: 14 },

  section: { marginTop: 14 },
  label: { marginBottom: 7, color: '#83838a', fontSize: 9, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  shapeGrid: { flexDirection: 'row', gap: 4 },
  shapeOption: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: C.card },
  shapeActive: { backgroundColor: '#38383e', borderWidth: 1, borderColor: 'rgba(242,239,229,0.55)' },
  colorGrid: { flexDirection: 'row', gap: 8 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  dotActive: { borderWidth: 2, borderColor: C.paper },

  card: { overflow: 'hidden', borderRadius: 11, backgroundColor: C.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, paddingHorizontal: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.hairline },
  rowCopy: { flex: 1 },
  rowName: { color: '#ededf0', fontSize: 12, fontWeight: '500' },
  rowMeta: { color: '#808087', fontSize: 9 },
  check: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  checkOn: { backgroundColor: C.paper, borderColor: C.paper },
  checkMark: { color: '#1b1b19', fontSize: 11, fontWeight: '700' },

  foot: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 10 },
  // The same pill as Customize on the arc: the app's glass, in its paper.
  primary: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: INK.onPaper, fontSize: 14, fontWeight: '600' },
});
