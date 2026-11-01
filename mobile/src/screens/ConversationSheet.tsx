import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { Bloub } from '../components/Bloub';
import { ModelList } from '../components/ModelList';
import { Toggle } from '../components/Toggle';
import { ConfirmBlock, PrimaryButton, Row, SectionLabel, SheetHeader } from '../components/UI';
import { useStore } from '../store';
import { C, createStyles } from '../theme';

/**
 * What a conversation is, and what can be done to it. The model is per
 * conversation; the memory is the bot's, on the host, and is not touched by
 * anything here.
 */
export function ConversationSheet({
  visible,
  onClose,
  threadId,
}: {
  visible: boolean;
  onClose: () => void;
  threadId: string;
}) {
  const { threadById, botById, toggles, toggle, setModel, clearThread, togglePin } = useStore();
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const thread = threadById(threadId);
  const bot = thread ? botById(thread.botId) : undefined;

  if (!thread) return null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      {picking ? (
        <>
          <SheetHeader
            title="Model"
            sub="For this conversation only. The bot keeps its memory."
            onClose={onClose}
            back={() => setPicking(false)}
          />
          <ModelList
            selected={thread.threadModel}
            onPick={(picked) => {
              setModel(thread.id, picked);
              setPicking(false);
            }}
          />
        </>
      ) : (
        <>
          <SheetHeader
            title={thread.name}
            sub={`Hermes host · ${thread.threadModel}`}
            onClose={onClose}
          />
          {confirming ? (
            <ConfirmBlock
              title="Clear this conversation?"
              message="The bubbles go; the bot stays, with its memory and its session."
              confirmLabel="Clear"
              onCancel={() => setConfirming(false)}
              onConfirm={() => {
                clearThread(thread.id);
                setConfirming(false);
                onClose();
              }}
            />
          ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.face}>
              <Bloub shape={bot?.shape} color={bot?.color ?? '#8b5cf6'} size={54} />
            </View>

            <SectionLabel>Conversation</SectionLabel>
            <View style={styles.card}>
              <Row name="Model" value={thread.threadModel} onPress={() => setPicking(true)} />
              <View style={styles.line} />
              <Row name="Sessions" value="1 session" chevron={false} />
              <View style={styles.line} />
              <Row
                name="Pinned"
                chevron={false}
                right={
                  <Toggle
                    on={Boolean(thread.pinned)}
                    onChange={() => togglePin(thread.id)}
                    label="Pinned"
                  />
                }
              />
              <View style={styles.line} />
              <Row
                name="Tapbacks"
                chevron={false}
                right={
                  <Toggle
                    on={toggles.tapbacks}
                    onChange={() => toggle('tapbacks')}
                    label="Tapbacks"
                  />
                }
              />
              <View style={styles.line} />
              <Row
                name="Notifications"
                chevron={false}
                right={
                  <Toggle
                    on={toggles.notifications}
                    onChange={() => toggle('notifications')}
                    label="Notifications"
                  />
                }
              />
            </View>

            <View style={styles.buttons}>
              <PrimaryButton label="Clear conversation" onPress={() => setConfirming(true)} />
            </View>
          </ScrollView>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 18, flexShrink: 1 },
  face: { alignItems: 'center', paddingVertical: 10 },
  card: { borderRadius: 13, backgroundColor: C.cardRaised, overflow: 'hidden' },
  line: { height: 1, backgroundColor: C.hairline },
  buttons: { marginTop: 14 },
});
