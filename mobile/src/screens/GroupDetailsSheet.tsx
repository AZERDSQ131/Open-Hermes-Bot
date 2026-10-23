import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { Bloub, BloubGroup } from '../components/Bloub';
import { ChevronIcon, CloseIcon } from '../components/Icons';
import { ModelList } from '../components/ModelList';
import { ConfirmBlock } from '../components/UI';
import { Toggle } from '../components/Toggle';
import { useStore } from '../store';
import { C, INK, createStyles } from '../theme';

/**
 * What a group is: its members, each on its own session, and the two things
 * the round is allowed to make noise with — tapbacks and notifications.
 */
export function GroupDetailsSheet({
  visible,
  onClose,
  threadId,
  onLeave,
}: {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  onLeave: () => void;
}) {
  const { threadById, botById, setModel, toggles, toggle, updateGroup, leaveGroup } = useStore();
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<
    { kind: 'leave' } | { kind: 'remove'; id: string; name: string } | null
  >(null);
  const thread = threadById(threadId);
  // Read once: the callbacks below run later, when the narrowing is gone.
  const memberIds = thread?.members ?? [];

  const members = memberIds.map((id) => botById(id)).filter(Boolean);
  const faces = members.map((bot) => ({ shape: bot!.shape, color: bot!.color }));

  return (
    <Sheet visible={visible} onClose={onClose}>
      {picking && thread ? (
        <>
          <View style={styles.pickHead}>
            <Pressable style={styles.back} onPress={() => setPicking(false)}>
              <ChevronIcon size={14} color="#a8a8af" />
            </Pressable>
            <Text style={styles.pickTitle}>Model</Text>
          </View>
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
          <View style={styles.top}>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close">
              <CloseIcon />
            </Pressable>
            <BloubGroup members={faces} size={58} />
            <Text style={styles.name}>{thread?.name ?? 'Group'}</Text>
            <Text style={styles.sub}>{thread?.subtitle ?? ''}</Text>
          </View>

          {pending ? (
            <ConfirmBlock
              title={
                pending.kind === 'leave' ? 'Leave this group?' : `Remove ${pending.name}?`
              }
              message={
                pending.kind === 'leave'
                  ? 'Its conversation goes; the bots stay, each with its own session.'
                  : 'The bot keeps its own session and memory; only the round loses it.'
              }
              confirmLabel={pending.kind === 'leave' ? 'Leave' : 'Remove'}
              onCancel={() => setPending(null)}
              onConfirm={() => {
                if (pending.kind === 'leave') {
                  leaveGroup(threadId);
                  setPending(null);
                  onClose();
                  onLeave();
                } else {
                  updateGroup(threadId, {
                    members: memberIds.filter((id) => id !== pending.id),
                  });
                  setPending(null);
                }
              }}
            />
          ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.label}>Members</Text>
            <View style={styles.card}>
              {members.map((bot, index) => (
                <Pressable
                  key={bot!.id}
                  style={[styles.row, index > 0 && styles.line]}
                  onPress={() =>
                    setPending({ kind: 'remove', id: bot!.id, name: bot!.name })
                  }
                >
                  <Bloub shape={bot!.shape} color={bot!.color} size={26} />
                  <View style={styles.copy}>
                    <Text style={styles.rowName}>{bot!.name}</Text>
                    <Text style={styles.rowMeta}>
                      {bot!.role} · session {bot!.session}
                    </Text>
                  </View>
                  <ChevronIcon />
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              Every member answers on its own, and can @ another to hand over the floor.
            </Text>

            <Text style={styles.label}>Conversation</Text>
            <View style={styles.card}>
              <Pressable style={styles.row} onPress={() => setPicking(true)}>
                <View style={styles.copy}>
                  <Text style={styles.rowName}>Model</Text>
                </View>
                <Text style={styles.value}>{thread?.threadModel}</Text>
                <ChevronIcon />
              </Pressable>
              <View style={[styles.row, styles.line]}>
                <View style={styles.copy}>
                  <Text style={styles.rowName}>Sessions</Text>
                </View>
                <Text style={styles.value}>{members.length} separate</Text>
              </View>
              <View style={[styles.row, styles.line]}>
                <View style={styles.copy}>
                  <Text style={styles.rowName}>Tapbacks</Text>
                </View>
                <Toggle
                  on={toggles.tapbacks}
                  onChange={() => toggle('tapbacks')}
                  label="Tapbacks"
                />
              </View>
              <View style={[styles.row, styles.line]}>
                <View style={styles.copy}>
                  <Text style={styles.rowName}>Notifications</Text>
                </View>
                <Toggle
                  on={toggles.notifications}
                  onChange={() => toggle('notifications')}
                  label="Notifications"
                />
              </View>
            </View>

            <Pressable style={styles.danger} onPress={() => setPending({ kind: 'leave' })}>
              <Text style={styles.dangerText}>Leave group</Text>
            </Pressable>
          </ScrollView>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = createStyles({
  top: { alignItems: 'center', paddingTop: 14, paddingHorizontal: 16 },
  close: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#34343a',
  },
  name: { marginTop: 8, color: C.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.46 },
  sub: { marginTop: 3, color: '#85858c', fontSize: 10 },

  body: { flexShrink: 1 },
  bodyContent: { paddingTop: 12, paddingHorizontal: 10, paddingBottom: 20 },
  label: {
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 4,
    color: INK.label,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.04,
    textTransform: 'uppercase',
  },
  card: { overflow: 'hidden', borderRadius: 11, backgroundColor: C.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, paddingHorizontal: 10 },
  line: { borderTopWidth: 1, borderTopColor: C.hairline },
  copy: { flex: 1 },
  rowName: { color: '#ededf0', fontSize: 12, fontWeight: '500' },
  rowMeta: { color: '#808087', fontSize: 9 },
  value: { color: '#8b8b92', fontSize: 11 },
  hint: { marginTop: 7, color: '#7c7c83', fontSize: 10, lineHeight: 14 },
  danger: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderRadius: 11,
    backgroundColor: C.card,
  },
  dangerText: { color: '#ff6961', fontSize: 12, fontWeight: '500' },

  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingHorizontal: 16 },
  back: { transform: [{ rotate: '180deg' }] },
  pickTitle: { color: C.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.48 },
});
