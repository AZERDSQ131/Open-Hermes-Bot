import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bloub, BloubGroup } from '../components/Bloub';
import { BackIcon, FileIcon, MicIcon, MoreIcon, PhotoIcon } from '../components/Icons';
import { Composer, type Outgoing } from '../components/Composer';
import { TypingDots } from '../components/TypingDots';
import { BotSheet } from './BotSheet';
import { ConversationSheet } from './ConversationSheet';
import { GroupDetailsSheet } from './GroupDetailsSheet';
import { MessageSheet } from './MessageSheet';
import { CHAT_EVENTS, type Bot, type Message } from '../data';
import { useStore } from '../store';
import type { RootStackParamList } from '../nav';
import { C, INK, createStyles } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The @ that names a bot of the round, in the bubble's own colour. */
function MessageText({ text, users, style }: { text: string; users: Bot[]; style: object }) {
  const names = users.map((bot) => bot.name).sort((a, b) => b.length - a.length);
  if (names.length === 0 || !text.includes('@')) {
    return <Text style={style}>{text}</Text>;
  }
  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g');
  const parts = text.split(pattern);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <Text key={index} style={styles.mention}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const {
    threads,
    messages,
    bots,
    botById,
    prefs,
    send,
    markRead,
    threadById,
  } = useStore();

  const [modelsOpen, setModelsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [active, setActive] = useState<Message | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const thread = threadById(route.params.threadId);
  const threadId = route.params.threadId;

  // Opening a conversation reads it: the dot is the app's, not the bot's.
  useEffect(() => {
    markRead(threadId);
  }, [markRead, threadId]);

  if (!thread) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.nav}>
          <Pressable style={styles.navIcon} onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <BackIcon />
          </Pressable>
          <View style={styles.chatId}>
            <Text style={styles.chatName}>This conversation is gone</Text>
          </View>
        </View>
        <Text style={styles.missing}>It was deleted. The chat list has the rest.</Text>
      </View>
    );
  }

  const bot = botById(thread.botId);
  const members = (thread.members ?? [])
    .map((id) => botById(id))
    .filter(Boolean) as Bot[];
  const faces =
    thread.kind === 'group' ? members.map((entry) => ({ shape: entry.shape, color: entry.color })) : [];
  const turns = messages[thread.id] ?? [];
  const meta = CHAT_EVENTS[thread.id];
  const isGroup = thread.kind === 'group';

  function delivery(payload: Outgoing) {
    send(threadId, payload);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 40);
  }

  function renderMessage(message: Message) {
    const mine = message.from === 'user';
    const author = mine ? null : botById(message.from);
    const ink = mine ? styles.bubbleUserText : styles.bubbleBotText;

    return (
      <View
        key={message.id}
        style={[styles.msg, mine ? styles.msgUser : isGroup ? styles.msgGroup : styles.msgBot]}
      >
        {isGroup && !mine && author ? (
          <View style={styles.msgAvatar}>
            <Bloub shape={author.shape} color={author.color} size={24} />
          </View>
        ) : null}

        <View style={[styles.bubbleWrap, mine && styles.bubbleWrapUser]}>
          {isGroup && !mine && author ? <Text style={styles.author}>{author.name}</Text> : null}

          <Pressable
            onLongPress={() => setActive(message)}
            delayLongPress={260}
            style={[
              styles.bubble,
              mine ? styles.bubbleUser : styles.bubbleBot,
              isGroup && styles.bubbleGroup,
            ]}
            accessibilityHint="Long press for tapback, copy or delete"
          >
            {message.kind === 'attachment' && message.attachment ? (
              <View style={styles.attachment}>
                {message.attachment.name.endsWith('.HEIC') || message.attachment.name.endsWith('.jpg') ? (
                  <PhotoIcon color={mine ? '#4b4a45' : '#c9c9cf'} />
                ) : (
                  <FileIcon color={mine ? '#4b4a45' : '#c9c9cf'} />
                )}
                <View style={styles.attachmentCopy}>
                  <Text style={ink} numberOfLines={1}>
                    {message.attachment.name}
                  </Text>
                  <Text style={[styles.attachmentSize, mine ? styles.onPaperQuiet : null]}>
                    {message.attachment.size}
                  </Text>
                </View>
              </View>
            ) : message.kind === 'voice' ? (
              <View style={styles.voice}>
                <MicIcon size={14} color={mine ? '#4b4a45' : '#c9c9cf'} />
                <Text style={ink}>Voice note</Text>
                <Text style={[styles.voiceTime, mine ? styles.onPaperQuiet : null]}>
                  {message.duration ?? '0:07'}
                </Text>
              </View>
            ) : (
              <MessageText text={message.text} users={members} style={ink} />
            )}
          </Pressable>

          {message.reaction ? (
            <Pressable
              style={styles.tapback}
              onPress={() => setActive(message)}
              accessibilityLabel="Change the tapback"
            >
              <Text style={styles.tapbackEmoji}>{message.reaction.emoji}</Text>
              <Text style={styles.tapbackCount}>{message.reaction.count}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.nav}>
          <Pressable style={styles.navIcon} onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <BackIcon />
          </Pressable>

          <Pressable
            style={styles.chatId}
            onPress={() => (isGroup ? setDetailsOpen(true) : setBotOpen(true))}
            accessibilityRole="button"
            accessibilityLabel={`Open ${thread.name}`}
          >
            {isGroup ? (
              <BloubGroup members={faces} size={30} />
            ) : (
              <Bloub shape={bot?.shape} color={bot?.color ?? '#8b5cf6'} size={30} />
            )}
            <View style={styles.chatTitles}>
              <Text style={styles.chatName} numberOfLines={1}>
                {thread.name}
              </Text>
              <Text style={styles.chatSub} numberOfLines={1}>
                {isGroup ? thread.subtitle : `Hermes host · ${thread.threadModel}`}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.navIcon}
            onPress={() => (isGroup ? setDetailsOpen(true) : setModelsOpen(true))}
            accessibilityLabel={isGroup ? 'Group details' : 'Conversation details'}
          >
            <MoreIcon />
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {meta ? (
            <>
              <Text style={styles.event}>{meta.event}</Text>
              <Text style={styles.time}>{meta.time}</Text>
            </>
          ) : null}

          {turns.length === 0 ? (
            <Text style={styles.empty}>
              Nothing said yet. The turn is yours — the bot keeps its memory on the host.
            </Text>
          ) : null}

          {turns.map(renderMessage)}

          {meta?.typing || thread.typing ? (
            <View style={styles.typing}>
              <Bloub shape={bot?.shape ?? 'capsule'} color={bot?.color ?? '#4f9d8f'} size={18} />
              <Text style={styles.typingLabel}>{thread.name} is thinking</Text>
              <TypingDots />
            </View>
          ) : null}
        </ScrollView>

        <Composer thread={thread} bots={bots} onSend={delivery} />
      </View>

      {/* The bot itself, from its face at the top of the conversation. */}
      <BotSheet
        visible={botOpen}
        botId={isGroup ? null : (bot?.id ?? null)}
        onClose={() => setBotOpen(false)}
        onOpen={() => setBotOpen(false)}
        onDeleted={() => {
          setBotOpen(false);
          navigation.goBack();
        }}
      />

      {/* One-to-one details, and the model it runs on. */}
      <ConversationSheet
        visible={modelsOpen}
        onClose={() => setModelsOpen(false)}
        threadId={thread.id}
        onDeleted={() => navigation.goBack()}
      />
      <GroupDetailsSheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        threadId={thread.id}
        onLeave={() => navigation.goBack()}
      />
      <MessageSheet
        visible={active !== null}
        onClose={() => setActive(null)}
        threadId={thread.id}
        message={active}
      />
    </KeyboardAvoidingView>
  );
}

const styles = createStyles({
  root: { flex: 1, backgroundColor: C.bg },
  missing: { color: INK.quiet, padding: 20, fontSize: 12 },

  nav: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: 'rgba(29,29,31,0.98)',
  },
  navIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  chatId: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatTitles: { flex: 1, gap: 1 },
  chatName: { color: C.text, fontSize: 14.5, fontWeight: '600', letterSpacing: -0.23 },
  chatSub: { color: '#83838a', fontSize: 10 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 13, paddingTop: 13, paddingBottom: 2 },
  event: { marginBottom: 14, color: INK.faint, fontSize: 9, textAlign: 'center' },
  time: { marginBottom: 11, color: INK.meta, fontSize: 10, textAlign: 'center' },
  empty: { color: INK.quiet, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 20, marginTop: 24 },

  msg: { width: '100%', marginBottom: 9 },
  msgUser: { alignItems: 'flex-end' },
  msgBot: { alignItems: 'flex-start' },
  msgGroup: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  msgAvatar: { marginTop: 16 },
  bubbleWrap: { flexShrink: 1, maxWidth: '86%', alignItems: 'flex-start' },
  bubbleWrapUser: { alignItems: 'flex-end', maxWidth: '80%' },

  bubble: { maxWidth: '100%', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16 },
  bubbleBot: { backgroundColor: C.bubble },
  bubbleUser: { backgroundColor: C.paper },
  bubbleGroup: { maxWidth: '100%' },
  bubbleBotText: { color: '#f1f1f3', fontSize: 13, lineHeight: 19.4 },
  bubbleUserText: { color: INK.onPaper, fontSize: 13, lineHeight: 19.4 },
  mention: { backgroundColor: 'rgba(28,27,25,0.09)', borderRadius: 4, fontWeight: '500' },

  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150 },
  attachmentCopy: { flexShrink: 1 },
  attachmentSize: { color: '#a9a9b0', fontSize: 9, marginTop: 1 },
  onPaperQuiet: { color: '#6f6e66' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 130 },
  voiceTime: { color: '#a9a9b0', fontSize: 10, fontVariant: ['tabular-nums'] },

  author: { marginLeft: 3, marginBottom: 3, color: '#98989f', fontSize: 10, fontWeight: '600' },
  tapback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 21,
    marginTop: 4,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: 11,
    backgroundColor: C.bean,
  },
  tapbackEmoji: { fontSize: 10 },
  tapbackCount: { color: '#a9a9b0', fontSize: 9 },

  typing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  typingLabel: { color: '#8d8d94', fontSize: 10 },
});
