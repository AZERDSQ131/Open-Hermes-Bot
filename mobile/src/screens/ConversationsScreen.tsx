import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bloub, BloubGroup } from '../components/Bloub';
import { PlusIcon, SearchIcon, SettingsIcon } from '../components/Icons';
import { FirstRunBody } from '../components/FirstRun';
import { SwipeRow } from '../components/SwipeRow';
import { Sheet } from '../components/Sheet';
import { ConfirmBlock, Row, SheetHeader } from '../components/UI';
import { NewAgentSheet } from './NewAgentSheet';
import type { Thread } from '../data';
import { useStore } from '../store';
import { useAppNavigation } from '../nav';
import { C, INK, createStyles } from '../theme';

/**
 * What a person opens the app on: the bots they keep close, and the
 * conversations that moved. A long press on a row is the way to pin it, to
 * mark it read, or to let it go.
 */
export function ConversationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useAppNavigation();
  const { bots, threads, botById, prefs, connection, togglePin, markRead, markUnread, removeThread } =
    useStore();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<Thread | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Thread | null>(null);

  const needle = query.trim().toLowerCase();

  // A pinned conversation is on the strip above: it is not said twice.
  const unpinned = useMemo(() => threads.filter((thread) => !thread.pinned), [threads]);
  const recent = useMemo(
    () =>
      needle
        ? unpinned.filter((thread) =>
            `${thread.name} ${thread.preview}`.toLowerCase().includes(needle),
          )
        : unpinned,
    [needle, unpinned],
  );
  const pinned = useMemo(
    () =>
      threads
        .filter((thread) => thread.pinned)
        .filter((thread) =>
          needle ? `${thread.name} ${thread.preview}`.toLowerCase().includes(needle) : true,
        ),
    [needle, threads],
  );

  function faceOf(thread: Thread) {
    if (thread.kind === 'group') {
      const members = (thread.members ?? [])
        .map((id) => botById(id))
        .filter(Boolean)
        .map((bot) => ({ shape: bot!.shape, color: bot!.color }));
      return <BloubGroup members={members} size={38} />;
    }
    const bot = botById(thread.botId);
    return <Bloub shape={bot?.shape} color={bot?.color ?? '#8b5cf6'} size={38} />;
  }

  function open(thread: Thread) {
    navigation.navigate('Chat', { threadId: thread.id });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            Conversations
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.round}
              accessibilityLabel="Settings"
              onPress={() => navigation.navigate('Settings')}
            >
              <SettingsIcon />
            </Pressable>
            <Pressable
              style={styles.round}
              accessibilityLabel="New agent"
              onPress={() => setCreating(true)}
            >
              <PlusIcon />
            </Pressable>
          </View>
        </View>
        <Text style={styles.hostLine}>
          {prefs.host} ·{' '}
          {connection.status === 'connected'
            ? 'connected'
            : connection.status === 'connecting'
              ? 'connecting'
              : connection.status === 'error'
                ? 'bridge not answering'
                : 'sample conversation'}
        </Text>
      </View>

      {bots.length === 0 ? (
        <FirstRunBody
          onCreate={() => setCreating(true)}
          onSetup={() => navigation.navigate('Setup')}
        />
      ) : (
        <>
      <View style={styles.searchBox}>
        <View style={styles.search}>
          <SearchIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search bots"
            placeholderTextColor={INK.meta}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      {pinned.length > 0 ? (
        <View style={styles.pinned}>
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionText}>Pinned</Text>
            <Text style={styles.sectionCount}>{pinned.length}</Text>
          </View>
          <View style={styles.pinnedGrid}>
            {pinned.map((thread) => (
              <Pressable
                key={thread.id}
                style={({ pressed }) => [styles.pinnedItem, pressed && styles.pressed]}
                onPress={() => open(thread)}
                onLongPress={() => setMenu(thread)}
                delayLongPress={260}
              >
                {faceOf(thread)}
                <Text style={styles.pinnedName} numberOfLines={1}>
                  {thread.kind === 'group' ? thread.name : thread.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.recent} contentContainerStyle={styles.recentBody}>
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionText}>Recent</Text>
          <Text style={styles.sectionCount}>{recent.length}</Text>
        </View>

        {recent.map((thread) => (
          <SwipeRow
            key={thread.id}
            left={{
              label: thread.pinned ? 'Unpin' : 'Pin',
              glyph: '⌖',
              onPress: () => togglePin(thread.id),
            }}
            right={{
              label: thread.unread ? 'Read' : 'Unread',
              glyph: thread.unread ? '✓' : '●',
              onPress: () => (thread.unread ? markRead(thread.id) : markUnread(thread.id)),
            }}
          >
            <Pressable
              style={({ pressed }) => [styles.thread, pressed && styles.pressed]}
              onPress={() => open(thread)}
              onLongPress={() => setMenu(thread)}
              delayLongPress={260}
            >
              <View style={styles.avatarWrap}>
                {faceOf(thread)}
                {thread.unread ? <View style={styles.unread} /> : null}
              </View>
              <View style={styles.threadCopy}>
                <View style={styles.threadTop}>
                  <Text style={styles.threadName} numberOfLines={1}>
                    {thread.name}
                  </Text>
                  <Text style={styles.threadTime}>{thread.time}</Text>
                </View>
                <Text
                  style={[styles.threadPreview, thread.unread && styles.threadPreviewUnread]}
                  numberOfLines={1}
                >
                  {thread.preview}
                </Text>
              </View>
            </Pressable>
          </SwipeRow>
        ))}

        {recent.length === 0 ? (
          <Text style={styles.none}>
            {needle
              ? 'No bot by that name.'
              : threads.length === 0
                ? 'No conversation yet. The plus makes the first one.'
                : 'Everything is pinned above.'}
          </Text>
        ) : null}
      </ScrollView>
        </>
      )}

      <NewAgentSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(threadId) => {
          setCreating(false);
          navigation.navigate('Chat', { threadId });
        }}
      />

      <Sheet
        visible={menu !== null}
        onClose={() => {
          setMenu(null);
          setConfirmDelete(null);
        }}
      >
        {menu && confirmDelete ? (
          <ConfirmBlock
            title={`Delete ${menu.name}?`}
            message="The conversation goes. The bot stays, with its memory and its session."
            confirmLabel="Delete"
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => {
              removeThread(menu.id);
              setConfirmDelete(null);
              setMenu(null);
            }}
          />
        ) : menu ? (
          <>
            <SheetHeader
              title={menu.name}
              sub={menu.kind === 'group' ? menu.subtitle : 'One bot, one session'}
              onClose={() => setMenu(null)}
            />
            <View style={styles.menuBody}>
              <View style={styles.menuCard}>
                <Row
                  name={menu.pinned ? 'Unpin' : 'Pin to the top'}
                  chevron={false}
                  onPress={() => {
                    togglePin(menu.id);
                    setMenu(null);
                  }}
                />
                <View style={styles.menuLine} />
                <Row
                  name={menu.unread ? 'Mark as read' : 'Mark as unread'}
                  chevron={false}
                  onPress={() => {
                    if (menu.unread) markRead(menu.id);
                    else markUnread(menu.id);
                    setMenu(null);
                  }}
                />
                <View style={styles.menuLine} />
                <Row
                  name="Open"
                  chevron={false}
                  onPress={() => {
                    const target = menu;
                    setMenu(null);
                    open(target);
                  }}
                />
                <View style={styles.menuLine} />
                <Row name="Delete" chevron={false} onPress={() => setConfirmDelete(menu)} />
              </View>
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = createStyles({
  root: { flex: 1, backgroundColor: C.sidebar },
  head: { paddingHorizontal: 16, paddingBottom: 11 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
    color: C.text,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -1.08,
    lineHeight: 28,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hostLine: { marginTop: 3, color: INK.faint, fontSize: 10 },
  round: {
    width: 33,
    height: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 17,
    backgroundColor: C.field,
  },
  searchBox: { paddingHorizontal: 16 },
  search: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.field,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 12, padding: 0 },

  pinned: { paddingHorizontal: 9, paddingTop: 17, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.divider },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  sectionText: {
    color: '#6d6d74',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionCount: { color: '#56565c', fontSize: 10 },
  pinnedGrid: { flexDirection: 'row', gap: 1 },
  pinnedItem: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 4, paddingBottom: 2 },
  pressed: { opacity: 0.6 },
  pinnedName: { color: '#b4b4bb', fontSize: 10, fontWeight: '500', textAlign: 'center' },

  recent: { flex: 1 },
  recentBody: { paddingHorizontal: 7, paddingTop: 12 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  avatarWrap: { width: 38, height: 38 },
  unread: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: C.sidebar,
    borderRadius: 6,
    backgroundColor: C.blue,
  },
  threadCopy: { flex: 1, gap: 1 },
  threadTop: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  threadName: { flex: 1, color: INK.title, fontSize: 13.5, fontWeight: '600', letterSpacing: -0.19 },
  threadTime: { color: INK.meta, fontSize: 10 },
  threadPreview: { color: '#87878e', fontSize: 11, lineHeight: 14.5 },
  threadPreviewUnread: { color: '#a4a4ab' },
  none: { color: INK.quiet, fontSize: 12, padding: 12 },

  menuBody: { paddingTop: 14, paddingHorizontal: 12 },
  menuCard: { borderRadius: 13, backgroundColor: C.cardRaised, overflow: 'hidden' },
  menuLine: { height: 1, backgroundColor: C.hairline },
});
