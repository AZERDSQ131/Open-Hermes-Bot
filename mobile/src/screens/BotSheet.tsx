import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { Bloub } from '../components/Bloub';
import { ConfirmBlock, PrimaryButton, Field, SectionLabel, SheetHeader } from '../components/UI';
import { COLORS, SHAPES } from '../data';
import type { BloubShape } from '../bloubFrames';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

/**
 * One bot, as the host keeps it: a name, a shape, a colour — and the two
 * things a hand can do with it here: open its conversation, or let it go.
 */
export function BotSheet({
  visible,
  onClose,
  botId,
  onOpen,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  botId: string | null;
  onOpen: (threadId: string) => void;
  onDeleted: () => void;
}) {
  const { botById, threads, updateBot, removeBot } = useStore();
  const bot = botId ? botById(botId) : undefined;
  const [name, setName] = useState(bot?.name ?? '');
  const [shape, setShape] = useState<BloubShape>(bot?.shape ?? 'cercle');
  const [color, setColor] = useState(bot?.color ?? COLORS[0]);
  const [confirming, setConfirming] = useState(false);

  // A different bot is a different face: the sheet is reused, the fields are not.
  useEffect(() => {
    if (!bot) return;
    setName(bot.name);
    setShape(bot.shape);
    setColor(bot.color);
    // A question asked about another bot is not asked about this one.
    setConfirming(false);
  }, [bot?.id]);

  if (!bot) return null;

  const thread = threads.find((entry) => entry.kind === 'bot' && entry.botId === bot.id);

  function save() {
    updateBot(bot!.id, { name: name.trim() || bot!.name, shape, color });
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader
        title={bot.name}
        sub={`${bot.role} · session ${bot.session}`}
        onClose={onClose}
      />

      {confirming ? (
        <ConfirmBlock
          title={`Delete ${bot.name}?`}
          message="Its conversation goes too. The other bots stay, and every session they hold stays with them."
          confirmLabel="Delete this bot"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            removeBot(bot.id);
            onClose();
            onDeleted();
          }}
        />
      ) : (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.face}>
          <Bloub shape={shape} color={color} size={72} />
        </View>

        <Field label="Name" value={name} onChange={setName} placeholder="Bot name" />

        <SectionLabel>Shape</SectionLabel>
        <View style={styles.shapeGrid}>
          {SHAPES.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.shapeOption, shape === option.id && styles.shapeOn]}
              onPress={() => setShape(option.id)}
              accessibilityLabel={option.label}
            >
              <Bloub shape={option.id} color="#9a9aa2" size={22} />
            </Pressable>
          ))}
        </View>

        <SectionLabel>Colour</SectionLabel>
        <View style={styles.colorGrid}>
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
          <PrimaryButton label="Save the changes" onPress={save} />
          <View style={styles.gap} />
          <PrimaryButton
            label="Open the conversation"
            tone="quiet"
            onPress={() => {
              onClose();
              if (thread) onOpen(thread.id);
            }}
          />
          <View style={styles.gap} />
          <PrimaryButton label="Delete this bot" tone="danger" onPress={() => setConfirming(true)} />
        </View>
        <Text style={styles.note}>
          The memory lives on the host; this sheet only changes the face the app draws.
        </Text>
      </ScrollView>
      )}
    </Sheet>
  );
}

const styles = createStyles({
  scroll: { flexShrink: 1 },
  body: { paddingTop: 6, paddingHorizontal: 12, paddingBottom: 18 },
  face: { alignItems: 'center', paddingVertical: 10 },
  shapeGrid: { flexDirection: 'row', gap: 4 },
  shapeOption: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: C.card,
  },
  shapeOn: { backgroundColor: '#38383e', borderWidth: 1, borderColor: 'rgba(242,239,229,0.55)' },
  colorGrid: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  dotOn: { borderWidth: 2, borderColor: C.paper },
  buttons: { marginTop: 16 },
  gap: { height: 8 },
  note: { marginTop: 12, color: '#7c7c83', fontSize: 10, lineHeight: 14 },
});
