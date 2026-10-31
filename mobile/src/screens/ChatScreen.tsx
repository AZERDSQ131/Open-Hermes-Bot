import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
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
import { ReactionBar } from '../components/ReactionBar';
import { EmojiPicker } from '../components/EmojiPicker';
import { BotSheet } from './BotSheet';
import { ConversationSheet } from './ConversationSheet';
import { GroupDetailsSheet } from './GroupDetailsSheet';
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
    react,
    markRead,
    threadById,
  } = useStore();

  const [modelsOpen, setModelsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [active, setActive] = useState<Message | null>(null);
  const [emojiPicker, setEmojiPicker] = useState(false);
  // Where each message sits in the thread, and how far the thread is scrolled:
  // together they say whether the marks can open above the bubble or must
  // open below it.
  const positions = useRef<Record<string, number>>({});
  const scrollTop = useRef(0);
  const [reactionBelow, setReactionBelow] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  // A second tap on the same bubble, inside this window, is a tapback.
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  // The keyboard takes room from the body, fast. A transform would look
  // quicker still, but it moves the whole conversation out from under the
  // last messages; padding shrinks the list instead, and the end is brought
  // back once the composer has arrived.
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      Animated.timing(rise, {
        toValue: event.endCoordinates.height,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) scroll.current?.scrollToEnd({ animated: false });
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      Animated.timing(rise, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [rise]);

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

  function openReaction(message: Message) {
    const top = positions.current[message.id] ?? 0;
    setReactionBelow(top - scrollTop.current < 84);
    setActive(message);
  }

  function tapBubble(message: Message) {
    if (message.from === 'user') return;
    if (active?.id === message.id) {
      lastTap.current = null;
      setActive(null);
      return;
    }
    const now = Date.now();
    if (lastTap.current?.id === message.id && now - lastTap.current.at < 320) {
      lastTap.current = null;
      openReaction(message);
      return;
    }
    lastTap.current = { id: message.id, at: now };
  }

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
        onLayout={(event) => {
          positions.current[message.id] = event.nativeEvent.layout.y;
        }}
        style={[
          styles.msg,
          mine ? styles.msgUser : isGroup ? styles.msgGroup : styles.msgBot,
          active?.id === message.id && styles.msgActive,
        ]}
      >
        {isGroup && !mine && author ? (
          <View style={styles.msgAvatar}>
            <Bloub shape={author.shape} color={author.color} size={24} />
          </View>
        ) : null}

        <View style={[styles.bubbleWrap, mine && styles.bubbleWrapUser]}>
          {active?.id === message.id && !mine ? (
            <View
              style={[
                styles.reactionLayer,
                reactionBelow ? styles.reactionBelow : styles.reactionAbove,
              ]}
            >
              <ReactionBar
                selected={message.reaction?.emoji}
                onMore={() => setEmojiPicker(true)}
                onPick={(emoji) => {
                  react(threadId, message.id, emoji);
                  setActive(null);
                }}
              />
            </View>
          ) : null}

          {isGroup && !mine && author ? <Text style={styles.author}>{author.name}</Text> : null}

          <Pressable
            onPress={() => tapBubble(message)}
            onLongPress={mine ? undefined : () => openReaction(message)}
            delayLongPress={260}
            style={[
              styles.bubble,
              mine ? styles.bubbleUser : styles.bubbleBot,
              isGroup && styles.bubbleGroup,
            ]}
            accessibilityHint={mine ? undefined : 'Long press or double tap for a tapback'}
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
              onPress={mine ? undefined : () => openReaction(message)}
              accessibilityLabel={mine ? undefined : 'Change the tapback'}
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

        <Animated.View style={[styles.stage, { paddingBottom: rise }]}>
        <ScrollView
          ref={scroll}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          // A scroll puts the keyboard away: the turn is read, not typed.
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollTop.current = event.nativeEvent.contentOffset.y;
          }}
          onScrollBeginDrag={() => setActive(null)}
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
        </Animated.View>

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
      <EmojiPicker
        visible={emojiPicker && active !== null}
        onClose={() => setEmojiPicker(false)}
        onPick={(emoji) => {
          if (!active) return;
          react(threadId, active.id, emoji);
          setActive(null);
          setEmojiPicker(false);
        }}
      />
    </View>
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

  stage: { flex: 1 },
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
  msgActive: { zIndex: 30 },
  reactionLayer: { position: 'absolute', left: 0, zIndex: 20 },
  reactionAbove: { bottom: '100%', marginBottom: 6 },
  reactionBelow: { top: '100%', marginTop: 6 },
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
