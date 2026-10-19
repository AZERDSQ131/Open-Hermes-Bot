import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { AgentAvatar } from './components/AgentAvatar';
import type { BloubShape } from './components/bloubFrames';
import {
  CreateAgentDialog,
  toProfileId,
  type CreateBotOutcome,
  type CreateCandidate,
} from './components/CreateAgentDialog';
import { EditAgentDialog } from './components/EditAgentDialog';
import { MentionText } from './components/MentionText';
import { ModelPicker } from './components/ModelPicker';
import {
  ArrowUpIcon,
  FileIcon,
  GearIcon,
  MenuIcon,
  MicIcon,
  MonitorIcon,
  PlusIcon,
  SearchIcon,
} from './components/Icons';
import type { HermesProfile, HermesStatus } from './hermes';
import { defaultModelPick } from './modelPrefs';
import {
  extractReaction,
  REACTION_PROMPT,
  stripReactionMarkers,
} from './reactions';
import {
  groupInstructions,
  groupTurnMessage,
  MAX_GROUP_LINES,
  MAX_GROUP_WAVES,
  MAX_MEMBER_LINES,
  mentionsIn,
  readGroupTurn,
  silentReaction,
  stripSilentMarkers,
} from './group';
import { avatarColor, PRIMARY_AVATAR_COLOR } from './profileColor';
import { SettingsView } from './components/SettingsView';
import { LogoEditor } from './components/LogoEditor';
import { ThreadContextMenu } from './components/ThreadContextMenu';
import {
  type AvatarSpec,
  type GroupMember,
  type Message,
  type Thread,
} from './data';

const MAX_PINNED = 3;

function isQuotaFailure(message?: string): boolean {
  return Boolean(message && QUOTA_ERROR.test(message));
}

// A model picked once stays picked: new conversations start on the last one the
// person chose for that bot, instead of the profile's configured model — which
// may be the one that just refused to answer.
type PreferredModel = { model: string; provider: string; label: string };

function preferredModelKey(profile?: string) {
  return `sidekick.model.${profile || 'default'}`;
}

function readPreferredModel(profile?: string): PreferredModel | null {
  try {
    const raw = window.localStorage.getItem(preferredModelKey(profile));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreferredModel;
    return parsed?.model ? parsed : null;
  } catch {
    return null;
  }
}

function rememberPreferredModel(profile: string | undefined, pick: PreferredModel) {
  try {
    window.localStorage.setItem(preferredModelKey(profile), JSON.stringify(pick));
  } catch {
    // A full or blocked storage must not break sending.
  }
}

// The model a profile is configured with, looked up once per app run. The send
// path needs it when no default or pick exists, so the turn cannot keep running
// the model a previous turn left on the session while the chip shows another.
const configuredModelCache = new Map<string, PreferredModel>();

async function configuredModelFor(
  profile?: string,
): Promise<PreferredModel | null> {
  const key = profile || 'default';
  const cached = configuredModelCache.get(key);
  if (cached) return cached;
  const bridge = window.hermes;
  if (!bridge?.models) return null;
  const inventory = await withTimeout(bridge.models({ profile }), 6000);
  if (!inventory?.ok || !inventory.current) return null;
  const resolved: PreferredModel = {
    model: inventory.current,
    provider: inventory.currentProvider ?? '',
    label: inventory.current,
  };
  configuredModelCache.set(key, resolved);
  return resolved;
}

// A configured model can be out of quota while a free one on the same provider
// still answers. That is not a conversation-ending failure, so the first turn
// rescues itself; the picker then shows the model that actually replied.
const QUOTA_ERROR = /usage limit|quota|rate limit|too many requests|429|exhausted/i;

async function freeModelFor(profile?: string): Promise<PreferredModel | null> {
  const bridge = window.hermes;
  if (!bridge?.models) return null;
  try {
    const result = await bridge.models({ profile });
    if (!result.ok) return null;
    const free = (result.models ?? []).find((entry) =>
      /(^|[-_])free($|[-_])/i.test(entry.model),
    );
    return free
      ? { model: free.model, provider: free.provider, label: free.model }
      : null;
  } catch {
    return null;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// A tapback belongs on the user's latest message: the one the bot was answering.
function attachReaction(messages: Message[], emoji?: string): Message[] {
  if (!emoji) return messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'user') continue;
    return messages.map((message, at) =>
      at === index ? { ...message, reaction: emoji } : message,
    );
  }
  return messages;
}

// In a group, a tapback lands on the last line the reactor did not write, and
// is signed: two bots can react to the same message without overwriting one
// another. Reacting to your own line would be talking to yourself.
function attachGroupReaction(
  messages: Message[],
  emoji: string | undefined,
  by: string,
): Message[] {
  if (!emoji) return messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const target = messages[index];
    if (target.role === 'event') continue;
    if (target.role === 'assistant' && target.authorName === by) continue;
    return messages.map((message, at) => {
      if (at !== index || message.role === 'event') return message;
      const others = (message.reactions ?? []).filter(
        (reaction) => reaction.by !== by,
      );
      return {
        ...message,
        reactions: [...others, { emoji, by }],
      };
    });
  }
  return messages;
}

// The primary Hermes profile lives at ~/.hermes itself, not under profiles/, so
// the gateway never lists it. It is still the default bot: a permanent thread
// that talks to the root API paths and cannot be deleted.
const CHIEF_ID = 'system:chief-of-staff';

function chiefOfStaffThread(): Thread {
  return {
    id: CHIEF_ID,
    name: 'Chief of Staff',
    avatar: {
      color: PRIMARY_AVATAR_COLOR,
      shape: 'cercle',
      variant: 'neutral',
    },
    preview: 'Default bot',
    time: '',
    chatTime: '',
    messages: [],
    system: true,
  };
}

// A bot in Hermes becomes a thread here: the profile name is the identity, the
// title and colour are the ones Hermes already shows for it.
function threadForBot(profile: HermesProfile): Thread {
  return {
    id: `bot:${profile.name}`,
    name: profile.title?.trim() || profile.name,
    profile: profile.name,
    avatar: {
      color: avatarColor(profile.color, profile.name),
      shape: 'cercle',
      variant: 'neutral',
    },
    preview: '',
    time: '',
    chatTime: '',
    messages: [],
  };
}

// Real bots only: anything the gateway no longer serves leaves the sidebar, and
// threads without a profile (groups) stay where they are.
function mergeBots(
  current: Thread[],
  profiles: HermesProfile[],
  pending: Set<string>,
): Thread[] {
  const listed = new Set(profiles.map((profile) => profile.name));
  const existing = new Map(
    current
      .filter((thread) => thread.profile)
      .map((thread) => [thread.profile as string, thread]),
  );
  const bots = profiles.map(
    (profile) => existing.get(profile.name) ?? threadForBot(profile),
  );
  // A bot just created can be ready to answer before the gateway lists it; it
  // stays visible until the list catches up instead of vanishing on a refresh.
  const waiting = current.filter(
    (thread) =>
      thread.profile &&
      !listed.has(thread.profile) &&
      pending.has(thread.profile),
  );
  // The default bot is not a listed profile: it is carried across refreshes by
  // hand and stays at the head of the list.
  const chief =
    current.find((thread) => thread.system) ?? chiefOfStaffThread();
  const local = current.filter(
    (thread) => !thread.profile && !thread.system,
  );
  return [chief, ...bots, ...waiting, ...local];
}

/** A bridge call that never comes back must not leave a dialog spinning. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then(
      (value) => value,
      () => null,
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

type GroupRuntime = {
  roundId: string;
  members: GroupMember[];
  /** Requests generating right now, so a mention can stop one. */
  active: Map<string, { member: GroupMember }>;
  /** Members stopped by a mention during the current wave. */
  interrupted: Map<string, { mentionedBy: string }>;
};

type AttachmentFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'FILE';
  return name.slice(dot + 1).slice(0, 4).toUpperCase();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export default function App() {
  const [threads, setThreads] = useState<Thread[]>(() => [chiefOfStaffThread()]);
  const [activeId, setActiveId] = useState('');
  // A reply lands after the person may have moved on: unread is decided against
  // the thread that is open now, not the one that was open at send time.
  const activeIdRef = useRef(activeId);
  const [botsLoaded, setBotsLoaded] = useState(false);
  const [botsError, setBotsError] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [listening, setListening] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Escape closes the roster without changing what was typed.
  const [mentionHidden, setMentionHidden] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hermesStatus, setHermesStatus] = useState<HermesStatus>({
    state: 'disconnected',
  });

  // One live turn per thread, keyed by thread: a new message replaces the turn
  // in flight, and a replaced turn must not paint over the new one.
  const requestThread = useRef(new Map<string, string>());
  // A group round is more than one request: the round token survives every
  // member's turn and is what a newer message replaces.
  const groupRound = useRef(new Map<string, string>());
  // Every live group request maps back to its thread, so several members can
  // stream into the same conversation at once.
  const groupRequests = useRef(new Map<string, string>());
  // The round's in-flight members. A mention can reach into this map and stop
  // the bot it names before it derails the conversation.
  const groupRuntimes = useRef(new Map<string, GroupRuntime>());
  // Partial text per request, so a mention is detected while it streams.
  const groupLiveText = useRef(new Map<string, string>());
  // Messages that arrived while a turn was being replaced. A request cancelled
  // before Hermes stored it would otherwise vanish from the model's context.
  const superseded = useRef(new Map<string, string[]>());

  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow the growing reply only while the person is already at the bottom;
  // scrolling up to read must not be yanked back on the next token.
  const stickToBottom = useRef(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const renameCancelled = useRef(false);
  // Profiles created here but not yet reported by the gateway.
  const pendingBots = useRef(new Set<string>());
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // The sidebar is the real inventory: bots come from the gateway, never from
  // seed data. Refetched when the connection settles, so a reconnect picks up
  // bots created or removed on the machine meanwhile.
  useEffect(() => {
    const bridge = window.hermes;
    if (!bridge?.profiles) {
      setBotsLoaded(true);
      return;
    }
    let cancelled = false;
    bridge
      .profiles()
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.profiles) {
          const listed = new Set(
            (result.profiles ?? []).map((profile) => profile.name),
          );
          for (const name of [...pendingBots.current]) {
            if (listed.has(name)) pendingBots.current.delete(name);
          }
          setBotsError('');
          setThreads((current) =>
            mergeBots(current, result.profiles ?? [], pendingBots.current),
          );
        } else {
          setBotsError(result.error ?? 'Could not reach Hermes');
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBotsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hermesStatus.state]);

  // A deleted bot can take the open conversation with it; land on the first
  // one that still exists instead of showing an empty window.
  useEffect(() => {
    if (threads.length === 0) return;
    if (!threads.some((thread) => thread.id === activeId)) {
      setActiveId(threads[0].id);
    }
  }, [threads, activeId]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeThread =
    threads.find((thread) => thread.id === activeId) ?? threads[0];
  // The protocol marker is plumbing, not copy: a streaming bubble never shows it.
  const streamingText = activeThread?.streaming
    ? stripSilentMarkers(stripReactionMarkers(activeThread.streaming))
    : '';

  // What a message would use with nothing picked in this conversation, in the
  // same order as the send path: the default chosen for this bot, then the
  // model it last remembered. The chip needs it so it cannot promise another
  // model than the one the next turn will use.
  const activeFallbackLabel =
    !activeThread || activeThread.model
      ? undefined
      : (defaultModelPick(activeThread.profile) ??
          readPreferredModel(activeThread.profile))?.model;

  // Typing "@" in a group opens the roster: the person addresses a bot the
  // same way the bots address each other.
  const mentionMatch = useMemo(() => {
    const members = activeThread?.members;
    if (!members?.length || mentionHidden) return null;
    const found = /(^|\s)@([\p{L}\p{N}_ -]{0,32})$/u.exec(draft);
    if (!found) return null;
    const query = found[2].trimStart().toLowerCase();
    const suggestions = members.filter((member) =>
      member.name.toLowerCase().includes(query),
    );
    if (!suggestions.length) return null;
    return {
      start: found.index + found[1].length,
      end: draft.length,
      suggestions,
    };
  }, [activeThread?.members, draft, mentionHidden]);
  const activeMention = mentionMatch
    ? mentionIndex % mentionMatch.suggestions.length
    : 0;

  const orderedThreads = useMemo(
    () =>
      [...threads].sort(
        (a, b) =>
          Number(Boolean(b.system)) - Number(Boolean(a.system)) ||
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
      ),
    [threads],
  );

  const pinnedThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedThreads.filter(
      (thread) =>
        thread.pinned &&
        (!needle ||
          thread.name.toLowerCase().includes(needle) ||
          thread.preview.toLowerCase().includes(needle)),
    );
  }, [query, orderedThreads]);

  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedThreads.filter(
      (thread) =>
        !thread.pinned &&
        (!needle ||
          thread.name.toLowerCase().includes(needle) ||
          thread.preview.toLowerCase().includes(needle)),
    );
  }, [query, orderedThreads]);

  const contextThread = contextMenu
    ? (threads.find((thread) => thread.id === contextMenu.threadId) ?? null)
    : null;
  const editingThread = editingId
    ? (threads.find((thread) => thread.id === editingId) ?? null)
    : null;
  const pinnedCount = threads.filter((thread) => thread.pinned).length;

  const createCandidates = useMemo<CreateCandidate[]>(() => {
    return threads.flatMap((thread) => {
      if (thread.avatar.kind === 'group') return [];
      return [
        {
          id: thread.id,
          name: thread.name,
          profile: thread.profile,
          avatar: thread.avatar,
        },
      ];
    });
  }, [threads]);

  useEffect(() => {
    const bridge = window.hermes;
    if (!bridge?.onChatDelta) return;

    // A single-bot turn owns the whole thread; a group has one request per
    // member, each streaming into its own live row.
    const applySingle = (requestId: string, update: (thread: Thread) => Thread) => {
      const entry = [...requestThread.current.entries()].find(
        ([, current]) => current === requestId,
      );
      if (!entry) return false;
      const [threadId] = entry;
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId ? update(thread) : thread,
        ),
      );
      return true;
    };

    const applyLive = (
      requestId: string,
      update: (
        live: NonNullable<Thread['live']>[number],
      ) => NonNullable<Thread['live']>[number],
    ) => {
      const threadId = groupRequests.current.get(requestId);
      if (!threadId) return;
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                live: (thread.live ?? []).map((live) =>
                  live.requestId === requestId ? update(live) : live,
                ),
              }
            : thread,
        ),
      );
    };

    // A mention is not a post-turn hand-off: as soon as a bot writes `@Name`,
    // the named bot stops generating. It gets the mention as its next turn,
    // after the mentioner's line is settled, instead of talking over it.
    const stopForMention = (requestId: string, text: string) => {
      const threadId = groupRequests.current.get(requestId);
      if (!threadId) return;
      const runtime = groupRuntimes.current.get(threadId);
      if (!runtime || runtime.roundId !== groupRound.current.get(threadId)) {
        return;
      }
      const source = runtime.active.get(requestId);
      if (!source) return;
      const accumulated = `${groupLiveText.current.get(requestId) ?? ''}${text}`;
      groupLiveText.current.set(requestId, accumulated);
      for (const member of mentionsIn(accumulated, runtime.members)) {
        if (member.id === source.member.id) continue;
        if (runtime.interrupted.has(member.id)) continue;
        const target = [...runtime.active.entries()].find(
          ([, entry]) => entry.member.id === member.id,
        );
        if (!target) continue;
        const [targetRequestId] = target;
        runtime.interrupted.set(member.id, {
          mentionedBy: source.member.name,
        });
        runtime.active.delete(targetRequestId);
        groupLiveText.current.delete(targetRequestId);
        window.hermes?.cancelChat?.(targetRequestId);
        // The stopped bot leaves the live rows at once; its next turn begins
        // when the mentioner's line has landed in the transcript.
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  live: (thread.live ?? []).filter(
                    (live) => live.requestId !== targetRequestId,
                  ),
                }
              : thread,
          ),
        );
      }
    };

    const offDelta = bridge.onChatDelta(({ requestId, text }) => {
      if (
        applySingle(requestId, (thread) => ({
          ...thread,
          streaming: `${thread.streaming ?? ''}${text}`,
          tool: undefined,
        }))
      ) {
        return;
      }
      applyLive(requestId, (live) => ({
        ...live,
        text: `${live.text}${text}`,
        tool: undefined,
      }));
      stopForMention(requestId, text);
    });
    const offTool = bridge.onChatTool?.(({ requestId, tool }) => {
      if (applySingle(requestId, (thread) => ({ ...thread, tool }))) return;
      applyLive(requestId, (live) => ({ ...live, tool }));
    });

    return () => {
      offDelta?.();
      offTool?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setContextMenu(null);
        setEditingId(null);
        setLogoOpen(false);
        setRenaming(false);
        setCreateOpen(true);
      }
      if (event.key === ',') {
        event.preventDefault();
        setContextMenu(null);
        setLogoOpen(false);
        setRenaming(false);
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const bridge = window.hermes;
    if (!bridge) return;
    let cancelled = false;
    bridge
      .status()
      .then((current) => {
        if (!cancelled) setHermesStatus(current);
      })
      .catch(() => undefined);
    const unsubscribe = bridge.onStatus?.((current) => setHermesStatus(current));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!renaming) return;
    const input = nameInputRef.current;
    input?.focus();
    input?.select();
  }, [renaming]);

  useEffect(() => {
    if (!logoOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!logoRef.current?.contains(event.target as Node)) {
        setLogoOpen(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setLogoOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [logoOpen]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [activeId]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (!stickToBottom.current) return;
    // Tokens arrive several times a second: a smooth animation would restart on
    // every one and trail behind the text. Streaming jumps, a new message glides.
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: activeThread?.streaming || activeThread?.live?.length
        ? 'auto'
        : 'smooth',
    });
  }, [
    activeId,
    activeThread?.messages.length,
    activeThread?.thinking,
    activeThread?.streaming,
    activeThread?.live,
  ]);

  function clearAttachments() {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function selectThread(id: string) {
    setActiveId(id);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id && thread.unread
          ? { ...thread, unread: false }
          : thread,
      ),
    );
    clearAttachments();
    setListening(false);
    setLogoOpen(false);
    setRenaming(false);
    setContextMenu(null);
    setSidebarOpen(false);
    composerRef.current?.blur();
  }

  function openSettings() {
    setContextMenu(null);
    setLogoOpen(false);
    setRenaming(false);
    setSidebarOpen(false);
    setSettingsOpen(true);
  }

  function openCreateDialog() {
    setContextMenu(null);
    setEditingId(null);
    setLogoOpen(false);
    setRenaming(false);
    setSidebarOpen(false);
    setCreateOpen(true);
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function addThread(thread: Thread) {
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setCreateOpen(false);
    setLogoOpen(false);
    setRenaming(false);
    setQuery('');
    setDraft('');
    clearAttachments();
    setListening(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function handleCreateBot(input: {
    name: string;
    shape: BloubShape;
    /** The colour to start from, Hermes' own when nothing was picked. */
    color: string;
    /** Only set when the person chose a colour on purpose. */
    customColor?: string;
  }): Promise<CreateBotOutcome> {
    const bridge = window.hermes;
    let profile: string | undefined;
    let color = input.color;

    if (bridge?.createBot) {
      // One round trip builds the whole profile (~90 ms on the server), so the
      // dialog has nothing to poll: it closes as soon as this returns.
      const result = await withTimeout(
        bridge.createBot({
          name: toProfileId(input.name),
          title: input.name,
          color: input.customColor,
          description: `Bot created from Sidekick`,
        }),
        70000,
      );
      if (!result) {
        return {
          ok: false,
          error:
            'The app did not hear back from the server. Nothing was changed — check the connection and try again.',
        };
      }
      if (!result.ok) {
        return { ok: false, error: result.error ?? 'Could not create the bot' };
      }
      profile = result.name;
      if (profile) pendingBots.current.add(profile);
      // The colour the server keeps for this profile is the one to wear: that
      // is exactly what Hermes paints for the same bot. Only when nothing is
      // stored does the hue derived from the name stand in.
      color = avatarColor(result.color, profile) || color;
    }

    addThread({
      id: `agent-${uid()}`,
      name: input.name,
      profile,
      avatar: {
        color: avatarColor(color, profile),
        shape: input.shape,
        variant: 'neutral',
      },
      preview: profile ? `Hermes profile ${profile}` : 'Start a conversation',
      time: 'Now',
      chatTime: 'Now',
      messages: [],
    });
    return { ok: true };
  }

  function handleCreateGroup(input: { name: string; members: GroupMember[] }) {
    addThread({
      id: `group-${uid()}`,
      name: input.name,
      members: input.members,
      avatar: {
        kind: 'group',
        members: input.members.map((member) => member.avatar),
      },
      preview: 'Start a conversation',
      time: 'Now',
      chatTime: 'Now',
      messages: [],
    });
  }

  function openThreadMenu(threadId: string, x: number, y: number) {
    setLogoOpen(false);
    setRenaming(false);
    setContextMenu({ threadId, x, y });
  }

  function togglePin(id: string) {
    setThreads((current) => {
      const target = current.find((thread) => thread.id === id);
      if (!target) return current;
      const atLimit =
        current.filter((thread) => thread.pinned).length >= MAX_PINNED;
      if (!target.pinned && atLimit) return current;
      return current.map((thread) =>
        thread.id === id ? { ...thread, pinned: !thread.pinned } : thread,
      );
    });
    setContextMenu(null);
  }

  function toggleUnread(id: string) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, unread: !thread.unread } : thread,
      ),
    );
    setContextMenu(null);
  }

  function deleteThread(id: string) {
    const target = threads.find((thread) => thread.id === id);
    if (target?.system || threads.length <= 1) return;
    const index = orderedThreads.findIndex((thread) => thread.id === id);
    const fallback =
      orderedThreads[index + 1] ?? orderedThreads[index - 1] ?? null;

    // A deleted conversation has nobody to answer: stop whatever is still
    // writing into it, including the rest of a group round.
    const inFlight = requestThread.current.get(id);
    if (inFlight) window.hermes?.cancelChat?.(inFlight);
    requestThread.current.delete(id);
    cancelGroupRequests(id);
    groupRound.current.delete(id);

    setThreads((current) =>
      current
        .filter((thread) => thread.id !== id)
        .map((thread) => {
          if (!target || !thread.members?.length) return thread;
          const members = thread.members.filter(
            (member) =>
              member.id !== target.id &&
              (!target.profile || member.profile !== target.profile),
          );
          if (members.length === thread.members.length) return thread;
          // A bot that leaves the sidebar leaves its groups too, with a note
          // where it used to speak rather than a member that cannot answer.
          return {
            ...thread,
            members,
            avatar:
              thread.avatar.kind === 'group'
                ? {
                    kind: 'group',
                    members: members.map((member) => member.avatar),
                  }
                : thread.avatar,
            messages: [
              ...thread.messages,
              {
                id: uid(),
                role: 'event',
                text: `${target.name} left the group.`,
              },
            ],
          };
        }),
    );

    if (activeId === id) {
      if (fallback) setActiveId(fallback.id);
      clearAttachments();
      setListening(false);
      setLogoOpen(false);
      setRenaming(false);
    }

    setEditingId((current) => (current === id ? null : current));
    setContextMenu(null);
  }

  function startEditingThread(id: string) {
    setContextMenu(null);
    setLogoOpen(false);
    setRenaming(false);
    setEditingId(id);
  }

  function saveEditedAgent(input: { name: string; avatar: AvatarSpec }) {
    if (!editingThread) return;
    const id = editingThread.id;
    const avatar = input.avatar;
    setThreads((current) =>
      current.map((thread) => {
        if (thread.id === id) {
          return {
            ...thread,
            ...input,
            // The default bot keeps the name it is known by.
            name: thread.system ? thread.name : input.name,
            // Editing a group restyles its members; keep the identities used
            // to attribute group lines in step with the faces on the avatar.
            members:
              avatar.kind === 'group' && thread.members
                ? thread.members.map((member, index) => ({
                    ...member,
                    avatar: avatar.members[index] ?? member.avatar,
                  }))
                : thread.members,
          };
        }
        // A bot renamed or restyled here keeps the same identity in the groups
        // it belongs to — the roster is a view of the bots, not a copy.
        if (avatar.kind === 'group' || !thread.members) return thread;
        let changed = false;
        const members = thread.members.map((member) => {
          if (member.id !== id) return member;
          changed = true;
          return {
            ...member,
            name: input.name,
            avatar,
          };
        });
        if (!changed) return thread;
        return {
          ...thread,
          members,
          avatar:
            thread.avatar.kind === 'group'
              ? { kind: 'group', members: members.map((m) => m.avatar) }
              : thread.avatar,
        };
      }),
    );
    setEditingId(null);
  }

  function updateActiveAvatar(avatar: AvatarSpec) {
    setThreads((current) =>
      current.map((thread) => {
        if (thread.id !== activeId) return thread;
        if (avatar.kind !== 'group' || !thread.members) {
          return { ...thread, avatar };
        }
        return {
          ...thread,
          avatar,
          // The logo editor restyles members in place; the roster and every
          // future group line must wear the same faces.
          members: thread.members.map((member, index) => ({
            ...member,
            avatar: avatar.members[index] ?? member.avatar,
          })),
        };
      }),
    );
  }

  function startRenaming() {
    if (!activeThread) return;
    setNameDraft(activeThread.name);
    renameCancelled.current = false;
    setLogoOpen(false);
    setRenaming(true);
  }

  function commitRename() {
    if (!activeThread) return;
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setRenaming(false);
      return;
    }
    const nextName = nameDraft.trim();
    if (nextName && nextName !== activeThread.name) {
      const isBot = activeThread.avatar.kind !== 'group';
      setThreads((current) =>
        current.map((thread) => {
          if (thread.id === activeThread.id) {
            return { ...thread, name: nextName };
          }
          if (!isBot || !thread.members) return thread;
          let changed = false;
          const members = thread.members.map((member) => {
            if (member.id !== activeThread.id) return member;
            changed = true;
            return { ...member, name: nextName };
          });
          return changed ? { ...thread, members } : thread;
        }),
      );
    }
    setRenaming(false);
  }

  function cancelRename() {
    renameCancelled.current = true;
    setNameDraft('');
    setRenaming(false);
  }

  function autoSize(element: HTMLTextAreaElement) {
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    setMentionIndex(0);
    setMentionHidden(false);
    autoSize(event.target);
  }

  function insertMention(member: GroupMember) {
    if (!mentionMatch) return;
    const next = `${draft.slice(0, mentionMatch.start)}@${member.name} ${draft.slice(
      mentionMatch.end,
    )}`;
    setDraft(next);
    setMentionIndex(0);
    setMentionHidden(false);
    window.requestAnimationFrame(() => {
      const input = composerRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.length, next.length);
      autoSize(input);
    });
  }

  /** Stop every live request belonging to a group thread. */
  function cancelGroupRequests(threadId: string) {
    for (const [requestId, owner] of groupRequests.current) {
      if (owner !== threadId) continue;
      window.hermes?.cancelChat?.(requestId);
      groupRequests.current.delete(requestId);
      groupLiveText.current.delete(requestId);
    }
    groupRuntimes.current.delete(threadId);
  }

  /**
   * A group turn is one parallel wave per exchange: every member gets the new
   * line at the same time and answers on its own clock. Members that stayed
   * silent are not polled again; a member that named another bot hands the next
   * wave to it. Reactions and lines are settled once the wave is complete, in
   * roster order, so the transcript stays stable however the requests finish.
   */
  async function sendGroupMessage(
    thread: Thread,
    outgoing: string,
    preview: string,
  ) {
    const threadId = thread.id;
    const members = thread.members ?? [];
    const bridge = window.hermes;
    if (members.length === 0) {
      setThreads((current) =>
        current.map((item) =>
          item.id === threadId
            ? {
                ...item,
                messages: [
                  ...item.messages,
                  { id: uid(), role: 'user', text: outgoing },
                  {
                    id: uid(),
                    role: 'event',
                    text: 'This group has no bots left — create one and add it to a new group.',
                  },
                ],
              }
            : item,
        ),
      );
      setDraft('');
      clearAttachments();
      return;
    }

    const roundId = uid();
    groupRound.current.set(threadId, roundId);
    const isCurrent = () => groupRound.current.get(threadId) === roundId;
    // A newer message replaces the whole round, not just the member whose
    // request happened to be newest.
    cancelGroupRequests(threadId);
    const runtime: GroupRuntime = {
      roundId,
      members,
      active: new Map(),
      interrupted: new Map(),
    };
    groupRuntimes.current.set(threadId, runtime);

    stickToBottom.current = true;
    const userMessage: Message = { id: uid(), role: 'user', text: outgoing };
    let history: Message[] = [...thread.messages, userMessage];

    setThreads((current) =>
      current.map((item) =>
        item.id === threadId
          ? {
              ...item,
              messages: history,
              thinking: true,
              streaming: undefined,
              tool: undefined,
              live: [],
              preview,
            }
          : item,
      ),
    );
    setDraft('');
    clearAttachments();
    setListening(false);
    if (composerRef.current) composerRef.current.style.height = '40px';

    const finish = () => {
      groupRound.current.delete(threadId);
      groupRuntimes.current.delete(threadId);
    };

    const sync = (patch: (item: Thread) => Thread) => {
      setThreads((current) =>
        current.map((item) => (item.id === threadId ? patch(item) : item)),
      );
    };

    if (!bridge?.sendChat) {
      finish();
      sync((item) => ({
        ...item,
        thinking: false,
        streaming: undefined,
        live: [],
        messages: [
          ...item.messages,
          {
            id: uid(),
            role: 'event',
            text: 'Not connected to Hermes yet — open Settings, connect, then send this again.',
          },
        ],
      }));
      return;
    }

    // Naming bots hands them the floor; saying nothing to anyone asks the whole
    // group, and each member is free to stay silent.
    const asked = mentionsIn(outgoing, members);
    type Floor = {
      member: GroupMember;
      addressed: boolean;
      mentionedBy?: string;
    };
    // Every member receives the new line at once. A named bot is told it was
    // addressed; the others see the same room and decide to stay out.
    let wave: Floor[] = members.map((member) => ({
      member,
      addressed: asked.includes(member),
    }));
    const sessions: Record<string, string> = { ...(thread.sessions ?? {}) };
    const spoken = new Map<string, number>();
    let lines = 0;
    let reacted = false;
    let lastLine = '';
    let waves = 0;

    type Outcome = {
      floor: Floor;
      turn?: ReturnType<typeof readGroupTurn>;
      error?: string;
      note?: string;
      canceled?: boolean;
      /** Stopped because another bot named this member mid-generation. */
      interrupted?: { mentionedBy: string };
    };

    while (
      wave.length > 0 &&
      lines < MAX_GROUP_LINES &&
      waves < MAX_GROUP_WAVES
    ) {
      waves += 1;
      const seen = new Set<string>();
      const active = wave
        .filter((floor) => {
          if (seen.has(floor.member.id)) return false;
          seen.add(floor.member.id);
          return (spoken.get(floor.member.id) ?? 0) < MAX_MEMBER_LINES;
        })
        .slice(0, MAX_GROUP_LINES - lines);
      if (active.length === 0) break;

      const tasks = active.map((floor) => ({ floor, requestId: uid() }));
      runtime.interrupted.clear();
      for (const task of tasks) {
        groupRequests.current.set(task.requestId, threadId);
        runtime.active.set(task.requestId, { member: task.floor.member });
      }
      sync((item) => ({
        ...item,
        thinking: true,
        streaming: undefined,
        tool: undefined,
        live: tasks.map(({ floor, requestId }) => ({
          requestId,
          member: floor.member,
          text: '',
        })),
      }));

      // Sessions are opened next to each other, then every member answers at
      // the same time: nobody waits for the bot before them.
      const joinErrors = new Map<string, string>();
      await Promise.all(
        active.map(async (floor) => {
          const member = floor.member;
          if (sessions[member.id]) return;
          try {
            const created = await bridge.createSession({
              profile: member.profile,
              // The prefix keeps a group session from ever resuming a private
              // conversation with a title that happens to look the same.
              title: `Group · ${thread.name} · ${member.name}`,
            });
            if (created.ok && created.sessionId) {
              sessions[member.id] = created.sessionId;
            } else {
              joinErrors.set(
                member.id,
                created.error ?? 'the session could not be opened',
              );
            }
          } catch (reason) {
            joinErrors.set(
              member.id,
              reason instanceof Error && reason.message
                ? reason.message
                : 'the session could not be opened',
            );
          }
        }),
      );
      if (!isCurrent()) return;
      sync((item) => ({ ...item, sessions }));

      const outcomes = await Promise.all(
        tasks.map(async ({ floor, requestId }): Promise<Outcome> => {
          const member = floor.member;
          const stopped = () => runtime.interrupted.get(member.id);
          try {
            const joined = joinErrors.get(member.id);
            if (joined) {
              return {
                floor,
                error: `${member.name} could not join the group: ${joined}`,
              };
            }

            const configured = defaultModelPick(member.profile);
            let pick = configured ?? readPreferredModel(member.profile);
            if (!pick) pick = await configuredModelFor(member.profile);
            if (!isCurrent()) return { floor, canceled: true };
            const stoppedEarly = stopped();
            if (stoppedEarly) {
              return { floor, interrupted: stoppedEarly };
            }

            const wire = groupTurnMessage({
              groupName: thread.name,
              members,
              speaker: member,
              history,
              addressed: floor.addressed,
              mentionedBy: floor.mentionedBy,
            });
            const instructions = groupInstructions(thread.name, members);
            const ask = (modelPick: PreferredModel | null) =>
              bridge.sendChat({
                requestId,
                sessionId: sessions[member.id],
                message: wire,
                profile: member.profile,
                model: modelPick?.model,
                provider: modelPick?.provider,
                instructions,
              });

            let result = await ask(pick);
            if (!isCurrent()) return { floor, canceled: true };
            const stoppedWhileAsking = stopped();
            if (stoppedWhileAsking) {
              return { floor, interrupted: stoppedWhileAsking };
            }

            let note: string | undefined;
            if (!result.ok && isQuotaFailure(result.error)) {
              const failed = pick?.model ?? 'The configured model';
              const rescue = await freeModelFor(member.profile);
              if (rescue && rescue.model !== pick?.model) {
                result = await ask(rescue);
                if (!isCurrent()) return { floor, canceled: true };
                const stoppedWhileRescuing = stopped();
                if (stoppedWhileRescuing) {
                  return { floor, interrupted: stoppedWhileRescuing };
                }
                if (result.ok) {
                  // Same rule as a private thread: only a model that was not
                  // picked on purpose becomes the bot's remembered fallback.
                  if (!configured) {
                    rememberPreferredModel(member.profile, rescue);
                  }
                  note = `${failed} is out of quota — ${member.name} answered with ${rescue.model} instead.`;
                }
              }
            }
            if (!result.ok) {
              if (result.canceled) {
                const stoppedDuringTurn = stopped();
                return stoppedDuringTurn
                  ? { floor, interrupted: stoppedDuringTurn }
                  : { floor, canceled: true };
              }
              return {
                floor,
                error: `${member.name} could not answer: ${result.error ?? 'unknown error'}`,
              };
            }
            return {
              floor,
              turn: readGroupTurn(result.text ?? '', members),
              note,
            };
          } catch (reason) {
            if (!isCurrent()) return { floor, canceled: true };
            const stoppedInError = stopped();
            if (stoppedInError) {
              return { floor, interrupted: stoppedInError };
            }
            return {
              floor,
              error: `${member.name} could not answer: ${
                reason instanceof Error && reason.message
                  ? reason.message
                  : 'something broke'
              }`,
            };
          } finally {
            runtime.active.delete(requestId);
          }
        }),
      );

      if (!isCurrent()) return;
      for (const task of tasks) {
        groupRequests.current.delete(task.requestId);
        groupLiveText.current.delete(task.requestId);
      }

      // Settle in roster order: the transcript does not depend on which model
      // happened to answer first.
      const order = new Map(
        members.map((member, index) => [member.id, index]),
      );
      outcomes.sort(
        (left, right) =>
          (order.get(left.floor.member.id) ?? 0) -
          (order.get(right.floor.member.id) ?? 0),
      );

      // Every member in a wave answered the same conversation. Tapbacks land
      // on that state, before any of the wave's lines are appended. A member
      // that stayed silent still reacts: the code forces a tapback, it is not
      // left to the model's goodwill.
      const reactionSeed =
        [...history].reverse().find((message) => message.role !== 'event')?.id ??
        '';
      let reactionHistory = history;
      for (const outcome of outcomes) {
        const turn = outcome.turn;
        if (!turn) continue;
        const emoji = turn.silent
          ? silentReaction(outcome.floor.member.id, reactionSeed)
          : turn.emoji;
        if (!emoji) continue;
        reactionHistory = attachGroupReaction(
          reactionHistory,
          emoji,
          outcome.floor.member.name,
        );
        reacted = true;
      }
      history = reactionHistory;

      const next: Floor[] = [];
      const spokeThisWave = new Set<string>();
      for (const outcome of outcomes) {
        const member = outcome.floor.member;
        if (outcome.canceled) return;
        // A bot stopped by a mention does not post what it had started; it is
        // requeued below, once the mentioner's line is part of the transcript.
        if (outcome.interrupted) continue;
        if (outcome.note) {
          history = [
            ...history,
            { id: uid(), role: 'event', text: outcome.note },
          ];
        }
        if (outcome.error) {
          history = [
            ...history,
            { id: uid(), role: 'event', text: outcome.error },
          ];
          continue;
        }
        const turn = outcome.turn;
        if (!turn) continue;
        if (turn.silent) {
          // Silence is normal, but a bot asked by name owes the room a visible
          // "no" — otherwise the person waits for an answer that never comes.
          if (outcome.floor.addressed || outcome.floor.mentionedBy) {
            history = [
              ...history,
              {
                id: uid(),
                role: 'event',
                text: `${member.name} stayed silent.`,
              },
            ];
          }
          continue;
        }
        if (turn.text && lines < MAX_GROUP_LINES) {
          history = [
            ...history,
            {
              id: uid(),
              role: 'assistant',
              text: turn.text,
              authorId: member.id,
              authorName: member.name,
              authorAvatar: member.avatar,
            },
          ];
          lines += 1;
          spoken.set(member.id, (spoken.get(member.id) ?? 0) + 1);
          spokeThisWave.add(member.name);
          lastLine = turn.text;
          for (const mentioned of turn.mentions) {
            if (mentioned.id === member.id) continue;
            next.push({
              member: mentioned,
              addressed: false,
              mentionedBy: member.name,
            });
          }
        }
      }

      for (const outcome of outcomes) {
        if (!outcome.interrupted) continue;
        next.push({
          member: outcome.floor.member,
          addressed: outcome.floor.addressed,
          mentionedBy: spokeThisWave.has(outcome.interrupted.mentionedBy)
            ? outcome.interrupted.mentionedBy
            : undefined,
        });
      }

      sync((item) => ({ ...item, messages: history, live: [] }));
      wave = next;
    }

    if (!isCurrent()) return;
    finish();
    if (lines === 0 && !reacted) {
      history = [
        ...history,
        { id: uid(), role: 'event', text: 'The group stayed silent.' },
      ];
    }
    sync((item) => ({
      ...item,
      messages: history,
      thinking: false,
      streaming: undefined,
      tool: undefined,
      live: [],
      sessions,
      preview: lastLine
        ? lastLine.replace(/\s+/g, ' ').slice(0, 90)
        : item.preview,
      chatTime: 'Now',
      unread: threadId !== activeIdRef.current,
    }));
  }

  async function sendMessage() {
    const text = draft.trim();
    const thread = activeThread;
    if (!text || !thread) return;

    // A group speaks with many voices: it gets its own relay, not the single
    // bot turn below.
    if (thread.avatar.kind === 'group') {
      const outgoing = attachments.length
        ? `${text}\n\nAttached: ${attachments
            .map((attachment) => attachment.name)
            .join(', ')}`
        : text;
      await sendGroupMessage(thread, outgoing, text);
      return;
    }

    const threadId = thread.id;
    const requestId = uid();
    const bridge = window.hermes;

    // A newer message replaces the turn in flight: stop the old request so the
    // server stops writing an answer nobody is waiting for, then make this turn
    // the one whose stream is allowed to land. The thread keeps every message
    // and the same Hermes session, so the context is not lost.
    const previous = requestThread.current.get(threadId);
    if (previous) {
      bridge?.cancelChat?.(previous);
      // The replaced turn's message may not have reached the server before the
      // cancellation; carry it into the next prompt so the context never loses
      // a message the person can see in the transcript.
      const priorUser = [...thread.messages]
        .reverse()
        .find((message) => message.role === 'user');
      if (priorUser) {
        const queued = superseded.current.get(threadId) ?? [];
        if (queued[queued.length - 1] !== priorUser.text) {
          queued.push(priorUser.text);
          superseded.current.set(threadId, queued);
        }
      }
    }
    requestThread.current.set(threadId, requestId);
    const isCurrent = () => requestThread.current.get(threadId) === requestId;
    // Sending is an intent to look at the answer, even from inside older turn.
    stickToBottom.current = true;
    const outgoing = attachments.length
      ? `${text}\n\nAttached: ${attachments
          .map((attachment) => attachment.name)
          .join(', ')}`
      : text;
    const userMessage: Message = { id: uid(), role: 'user', text: outgoing };

    setThreads((current) =>
      current.map((item) =>
        item.id === threadId
          ? {
              ...item,
              messages: [...item.messages, userMessage],
              thinking: true,
              streaming: '',
              tool: undefined,
              preview: text,
            }
          : item,
      ),
    );

    setDraft('');
    clearAttachments();
    setListening(false);
    if (composerRef.current) {
      composerRef.current.style.height = '40px';
    }

    // Whatever goes wrong, the thread has to come back to rest with a reason
    // the person can read — never a spinner that stays forever.
    const fail = (message: string) => {
      // A replaced turn has nothing to say: the newer one owns the thread.
      if (!isCurrent()) return;
      requestThread.current.delete(threadId);
      setThreads((current) =>
        current.map((item) =>
          item.id === threadId
            ? {
                ...item,
                thinking: false,
                streaming: undefined,
                tool: undefined,
                unread: threadId !== activeIdRef.current,
                messages: [
                  ...item.messages,
                  { id: uid(), role: 'event', text: message },
                ],
              }
            : item,
        ),
      );
    };

    if (!bridge?.sendChat) {
      fail(
        'Not connected to Hermes yet — open Settings, connect, then send this again.',
      );
      return;
    }

    // A thrown bridge call used to leave the spinner up forever; every exit
    // from here has to settle the thread.
    let reply = '';
    let reaction: string | undefined;
    try {
      let sessionId = thread.sessionId;
      if (!sessionId) {
        const created = await bridge.createSession({
          profile: thread.profile,
          title: thread.name,
        });
        if (!created.ok || !created.sessionId) {
          fail(created.error ?? 'Could not open a conversation with this bot.');
          return;
        }
        sessionId = created.sessionId;
        setThreads((current) =>
          current.map((item) =>
            item.id === threadId ? { ...item, sessionId } : item,
          ),
        );
        if (!isCurrent()) return;
      }

      // Order of intent: this conversation's pick, the default Settings gives
      // this bot, the model it last remembered, then the model the profile is
      // configured with. The last step keeps the chip and the turn on the same
      // model once a default has been cleared.
      let fallback = thread.model
        ? null
        : (defaultModelPick(thread.profile) ??
            readPreferredModel(thread.profile));
      if (!thread.model && !fallback) {
        fallback = await configuredModelFor(thread.profile);
      }
      if (!isCurrent()) return;
      const queued = superseded.current.get(threadId) ?? [];
      // Carried inside the user turn, not the system prompt: Hermes stores the
      // message, so the next turn still knows what was typed during the cut.
      const carried = queued.length
        ? `\n\n(I also sent these while you were working; treat them as part of this request. A quick reaction may be enough to acknowledge the extra detail — the request itself still stands.)\n${queued
            .map((text) => `- ${text}`)
            .join('\n')}`
        : '';
      const wireMessage = carried ? `${outgoing}${carried}` : outgoing;
      const ask = (pick: PreferredModel | null) =>
        bridge.sendChat({
          requestId,
          sessionId: sessionId as string,
          message: wireMessage,
          profile: thread.profile,
          model: pick?.model,
          provider: pick?.provider,
          instructions: REACTION_PROMPT,
        });

      let result = await ask(
        thread.model
          ? {
              model: thread.model,
              provider: thread.modelProvider ?? '',
              label: thread.modelLabel ?? thread.model,
            }
          : fallback,
      );
      if (!isCurrent()) return;

      // Move to a free model rather than showing a dead end, then make that
      // switch visible in the thread: the chip and the note must agree. An
      // explicit pick is the person's choice, so it is not overwritten as the
      // bot's default — only the thread falls back for now.
      if (!result.ok && isQuotaFailure(result.error)) {
        const failed = thread.model ?? fallback?.model ?? 'The configured model';
        const rescue = await freeModelFor(thread.profile);
        if (rescue && rescue.model !== failed) {
          result = await ask(rescue);
          if (!isCurrent()) return;
          if (result.ok) {
            if (!thread.model) rememberPreferredModel(thread.profile, rescue);
            setThreads((current) =>
              current.map((item) =>
                item.id === threadId
                  ? {
                      ...item,
                      model: rescue.model,
                      modelProvider: rescue.provider,
                      modelLabel: rescue.label,
                      messages: [
                        ...item.messages,
                        {
                          id: uid(),
                          role: 'event',
                          text: `${failed} is out of quota — answered with ${rescue.model} instead.`,
                        },
                      ],
                    }
                  : item,
              ),
            );
          }
        }
      }

      if (!result.ok) {
        if (result.canceled) return;
        fail(result.error ?? 'The bot could not answer this one.');
        return;
      }
      const parsed = extractReaction(result.text ?? '');
      reply = parsed.text;
      reaction = parsed.emoji;
    } catch (reason) {
      fail(
        reason instanceof Error && reason.message
          ? reason.message
          : 'Something broke while talking to the bot.',
      );
      return;
    }

    // A tapback can be the whole reply: the user needs no bubble saying "OK".
    if (!reply && !reaction) {
      fail('The bot finished without saying anything.');
      return;
    }
    if (!isCurrent()) return;
    requestThread.current.delete(threadId);
    superseded.current.delete(threadId);

    setThreads((current) =>
      current.map((item) =>
        item.id === threadId
          ? {
              ...item,
              thinking: false,
              streaming: undefined,
              tool: undefined,
              preview: reply
                ? reply.replace(/\s+/g, ' ').slice(0, 90)
                : item.preview,
              chatTime: 'Now',
              unread: threadId !== activeIdRef.current,
              messages: attachReaction(
                reply
                  ? [
                      ...item.messages,
                      { id: uid(), role: 'assistant', text: reply },
                    ]
                  : item.messages,
                reaction,
              ),
            }
          : item,
      ),
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionMatch) {
      const count = mentionMatch.suggestions.length;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionHidden(true);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMentionIndex((current) => (current + step + count) % count);
        return;
      }
      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        insertMention(mentionMatch.suggestions[activeMention]);
        return;
      }
    }
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      setAttachments((current) => [
        ...current,
        ...files.map((file) => ({
          id: uid(),
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl: file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : undefined,
        })),
      ]);
    }
    event.target.value = '';
  }

  function toggleListening() {
    setListening((current) => !current);
    composerRef.current?.focus();
  }

  return (
    <div className={`app ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-topbar">
          <button
            type="button"
            className="topbar-button new-chat"
            onClick={openCreateDialog}
            aria-label="Create a bot or group"
            title="New bot or group  ⌘N"
          >
            <PlusIcon size={20} />
          </button>
        </div>

        <div className="search">
          <SearchIcon size={15} className="search-icon" />
          <input
            ref={searchRef}
            className="search-input"
            type="text"
            value={query}
            placeholder="Search"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                event.currentTarget.blur();
              }
            }}
            aria-label="Search agents"
          />
        </div>

        {pinnedThreads.length > 0 ? (
          <section className="pinned-strip" aria-label="Pinned agents">
            <div className="pinned-grid">
              {pinnedThreads.map((thread) => {
                const isActive = thread.id === activeThread?.id;
                return (
                  <button
                    type="button"
                    key={thread.id}
                    className={`pinned-item ${
                      isActive ? 'is-active' : ''
                    } ${thread.unread ? 'is-unread' : ''} ${
                      contextMenu?.threadId === thread.id ? 'is-context' : ''
                    }`}
                    onClick={() => selectThread(thread.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openThreadMenu(
                        thread.id,
                        event.clientX,
                        event.clientY,
                      );
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    title={thread.name}
                  >
                    <span className="pinned-avatar">
                      <AgentAvatar
                        avatar={thread.avatar}
                        size={68}
                        unread={thread.unread}
                      />
                    </span>
                    <span className="pinned-name">{thread.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <nav className="thread-list" aria-label="Agents">
          {filteredThreads.map((thread) => {
            const isActive = thread.id === activeThread?.id;
            return (
              <button
                type="button"
                key={thread.id}
                className={`thread-row ${isActive ? 'is-active' : ''} ${
                  thread.unread ? 'is-unread' : ''
                } ${contextMenu?.threadId === thread.id ? 'is-context' : ''}`}
                onClick={() => selectThread(thread.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openThreadMenu(thread.id, event.clientX, event.clientY);
                }}
                aria-current={isActive ? 'true' : undefined}
              >
                <AgentAvatar
                  avatar={thread.avatar}
                  size={40}
                  className="thread-avatar"
                  unread={thread.unread}
                />
                <span className="thread-copy">
                  <span className="thread-heading">
                    <span className="thread-name">{thread.name}</span>
                    <span className="thread-time">{thread.time}</span>
                  </span>
                  <span className={`thread-preview ${thread.thinking ? 'is-typing' : ''}`}>
                    {thread.thinking ? 'Typing...' : thread.preview}
                  </span>
                </span>
              </button>
            );
          })}

          {filteredThreads.length === 0 && pinnedThreads.length === 0 ? (
            <p className="no-results">No agents found</p>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`settings-entry ${
              settingsOpen ? 'is-active' : ''
            }`}
            onClick={openSettings}
            aria-label="Settings"
            title="Settings  ⌘,"
          >
            <GearIcon size={16} />
            <span className="settings-entry-label">Settings</span>
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Close agents"
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />

      {activeThread ? (
      <main className="chat">
        <header className="chat-header">
          <div className="chat-header-inner">
            <button
              type="button"
              className="header-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open agents"
              aria-expanded={sidebarOpen}
              title="Open agents"
            >
              <MenuIcon size={19} />
            </button>
            <div className="header-agent" ref={logoRef}>
              <button
                type="button"
                className={`header-logo ${logoOpen ? 'is-open' : ''}`}
                onClick={() => setLogoOpen((current) => !current)}
                aria-label="Change logo"
                aria-expanded={logoOpen}
                title="Change logo"
              >
                <AgentAvatar
                  avatar={activeThread.avatar}
                  size={27}
                  className="header-avatar"
                  showBadge={false}
                />
              </button>
              {logoOpen ? (
                <LogoEditor
                  avatar={activeThread.avatar}
                  onChange={updateActiveAvatar}
                  onClose={() => setLogoOpen(false)}
                />
              ) : null}
            </div>

            {renaming ? (
              <input
                ref={nameInputRef}
                className="chat-title-input"
                value={nameDraft}
                maxLength={40}
                spellCheck={false}
                aria-label="Agent name"
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
              />
            ) : (
              <h1 className="chat-title">
                <button
                  type="button"
                  className="chat-title-button"
                  onClick={startRenaming}
                  title="Rename agent"
                >
                  {activeThread.name}
                </button>
              </h1>
            )}

            <button
              type="button"
              className="header-action"
              aria-label="Open agent display"
              title="Open agent display"
            >
              <MonitorIcon size={19} />
            </button>
          </div>
        </header>

        <div
          className="chat-scroll"
          ref={scrollRef}
          onScroll={() => {
            const scroller = scrollRef.current;
            if (!scroller) return;
            const distance =
              scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
            stickToBottom.current = distance < 60;
          }}
        >
          <div className="chat-inner">
            {activeThread.messages.length === 0 ? (
              <div className="empty-state">
                <AgentAvatar
                  avatar={activeThread.avatar}
                  size={62}
                  className="empty-avatar"
                  showBadge={false}
                />
                <h2>
                  {activeThread.avatar.kind === 'group'
                    ? 'What should this group handle?'
                    : 'What should this agent handle?'}
                </h2>
                <p>
                  {activeThread.avatar.kind === 'group'
                    ? 'Give the crew a job, or @ a bot to ask it directly. The rest can stay silent.'
                    : 'Give it a job. It works while you sleep.'}
                </p>
              </div>
            ) : (
              <>
                <div className="chat-time">{activeThread.chatTime}</div>

                {activeThread.messages.map((message) =>
                  message.role === 'event' ? (
                    <div className="chat-event" key={message.id}>
                      {message.text}
                    </div>
                  ) : (
                    <div
                      className={`message-row ${message.role} ${
                        message.authorName ? 'is-group-line' : ''
                      }`}
                      key={message.id}
                    >
                      {message.authorName && message.authorAvatar ? (
                        <AgentAvatar
                          avatar={message.authorAvatar}
                          size={52}
                          className="message-author-avatar"
                          showBadge={false}
                        />
                      ) : null}
                      <div
                        className={`bubble-wrap bubble-wrap-${message.role}`}
                      >
                        {message.authorName ? (
                          <span className="message-author">
                            {message.authorName}
                          </span>
                        ) : null}
                        <div className={`bubble bubble-${message.role}`}>
                          <MentionText
                            text={message.text}
                            members={activeThread.members}
                          />
                        </div>
                        {message.reaction ? (
                          <span
                            className="bubble-reaction"
                            role="img"
                            aria-label={`Agent reacted ${message.reaction}`}
                          >
                            {message.reaction}
                          </span>
                        ) : null}
                        {message.reactions?.length ? (
                          <span className="reaction-row">
                            {message.reactions.map((reaction) => (
                              <span
                                className="bubble-reaction is-inline"
                                role="img"
                                key={`${reaction.by}-${reaction.emoji}`}
                                aria-label={`${reaction.by ?? 'A bot'} reacted ${reaction.emoji}`}
                                title={
                                  reaction.by
                                    ? `${reaction.by} reacted ${reaction.emoji}`
                                    : undefined
                                }
                              >
                                {reaction.emoji}
                                {reaction.by ? (
                                  <span className="reaction-by">
                                    {reaction.by.split(' ')[0]}
                                  </span>
                                ) : null}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ),
                )}

                {activeThread.thinking ? (
                  activeThread.avatar.kind === 'group' ? (
                    activeThread.live?.length ? (
                      <div className="group-live">
                        {activeThread.live.map((live) => {
                          const liveText = stripSilentMarkers(
                            stripReactionMarkers(live.text),
                          );
                          return liveText.trim() ? (
                            <div
                              className="message-row assistant is-group-line"
                              key={live.requestId}
                            >
                              <AgentAvatar
                                avatar={live.member.avatar}
                                size={52}
                                className="message-author-avatar"
                                showBadge={false}
                              />
                              <div className="bubble-wrap bubble-wrap-assistant">
                                <span className="message-author">
                                  {live.member.name}
                                </span>
                                <div className="bubble bubble-assistant is-streaming">
                                  <MentionText
                                    text={liveText}
                                    members={activeThread.members}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="thinking-row"
                              key={live.requestId}
                            >
                              <AgentAvatar
                                avatar={live.member.avatar}
                                size={34}
                                className="thinking-avatar"
                                showBadge={false}
                              />
                              <span className="thinking-label">
                                {live.tool
                                  ? `${live.member.name} is using ${live.tool}…`
                                  : `${live.member.name} is thinking…`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="thinking-row">
                        <AgentAvatar
                          avatar={activeThread.avatar}
                          size={38}
                          className="thinking-avatar"
                          showBadge={false}
                        />
                        <span className="thinking-label">
                          The group is thinking…
                        </span>
                      </div>
                    )
                  ) : streamingText.trim() ? (
                    <div className="message-row assistant">
                      <div className="bubble-wrap bubble-wrap-assistant">
                        <div className="bubble bubble-assistant is-streaming">
                          {streamingText}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="thinking-row">
                      <AgentAvatar
                        avatar={activeThread.avatar}
                        size={38}
                        className="thinking-avatar"
                        showBadge={false}
                      />
                      <span className="thinking-label">
                        {activeThread.tool
                          ? `Using ${activeThread.tool}…`
                          : 'Thinking'}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="chat-tail" />
                )}
              </>
            )}
          </div>
        </div>

        <div className="composer-dock">
          <div className="composer-inner">
            <form
              className={`composer ${attachments.length ? 'has-attachments' : ''}`}
              onSubmit={handleSubmit}
            >
              {mentionMatch ? (
                <div
                  className="mention-menu"
                  role="listbox"
                  aria-label="Mention a bot"
                >
                  {mentionMatch.suggestions.map((member, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeMention}
                      className={`mention-option ${
                        index === activeMention ? 'is-active' : ''
                      }`}
                      key={member.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(member);
                      }}
                    >
                      <AgentAvatar
                        avatar={member.avatar}
                        size={20}
                        showBadge={false}
                      />
                      <span className="mention-option-name">
                        @{member.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {attachments.length > 0 ? (
                <div className="attachment-row">
                  {attachments.map((attachment) => (
                    <div
                      className={`attachment ${
                        attachment.previewUrl ? 'is-image' : 'is-file'
                      }`}
                      key={attachment.id}
                    >
                      <div className="attachment-visual">
                        {attachment.previewUrl ? (
                          <img
                            className="attachment-image"
                            src={attachment.previewUrl}
                            alt=""
                          />
                        ) : (
                          <span className="attachment-file">
                            <FileIcon size={26} />
                            <span className="attachment-ext">
                              {fileExtension(attachment.name)}
                            </span>
                          </span>
                        )}
                        <button
                          type="button"
                          className="attachment-remove"
                          aria-label={`Remove ${attachment.name}`}
                          title="Remove attachment"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="attachment-meta">
                        <span
                          className="attachment-name"
                          title={attachment.name}
                        >
                          {attachment.name}
                        </span>
                        <span className="attachment-size">
                          {formatFileSize(attachment.size)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="composer-main">
                <button
                  type="button"
                  className="composer-button attach-button"
                  aria-label="Attach a file"
                  title="Attach a file"
                  onClick={() => fileRef.current?.click()}
                >
                  <PlusIcon size={18} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleFiles}
                />
                <textarea
                  ref={composerRef}
                  className="composer-input"
                  rows={1}
                  value={draft}
                  placeholder={
                    listening
                      ? 'Listening...'
                      : activeThread.members?.length
                        ? 'Message the group — @ a bot to ask it directly'
                        : `Message ${activeThread.name}`
                  }
                  onChange={handleDraftChange}
                  onKeyDown={handleComposerKeyDown}
                  onBlur={() => setMentionHidden(true)}
                  aria-label={`Message ${activeThread.name}`}
                />
                {activeThread.avatar.kind === 'group' ? null : (
                <ModelPicker
                  profile={activeThread.profile}
                  value={activeThread.model}
                  provider={activeThread.modelProvider}
                  label={activeThread.modelLabel}
                  fallbackLabel={activeFallbackLabel}
                  disabled={activeThread.thinking}
                  connected={hermesStatus.state === 'connected'}
                  onChange={(pick) => {
                    if (pick.model) {
                      rememberPreferredModel(activeThread.profile, {
                        model: pick.model,
                        provider: pick.provider ?? '',
                        label: pick.label ?? pick.model,
                      });
                    }
                    setThreads((current) =>
                      current.map((thread) =>
                        thread.id === activeThread.id
                          ? {
                              ...thread,
                              model: pick.model,
                              modelProvider: pick.provider,
                              modelLabel: pick.label,
                            }
                          : thread,
                      ),
                    );
                  }}
                />
                )}
                {draft.trim() ? (
                  <button
                    type="submit"
                    className="composer-button send-button"
                    aria-label="Send message"
                    title="Send message"
                  >
                    <ArrowUpIcon size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`composer-button mic-button ${listening ? 'is-listening' : ''}`}
                    aria-label="Voice message"
                    title="Voice message"
                    onClick={toggleListening}
                  >
                    <MicIcon size={18} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>
      ) : (
        <main className="chat">
          <div className="empty-state no-bots">
            <h2>
              {!botsLoaded
                ? 'Looking for your bots…'
                : botsError
                  ? 'Hermes is out of reach'
                  : 'No bots yet'}
            </h2>
            <p>
              {!botsLoaded
                ? 'Asking Hermes which bots you have.'
                : botsError
                  ? botsError
                  : 'Bots live in Hermes. Create one and it appears here.'}
            </p>
            {botsLoaded ? (
              <button
                type="button"
                className="button-primary no-bots-action"
                onClick={botsError ? openSettings : openCreateDialog}
              >
                {botsError ? 'Open Connection' : 'Create a bot'}
              </button>
            ) : null}
          </div>
        </main>
      )}

      {contextMenu && contextThread ? (
        <ThreadContextMenu
          thread={contextThread}
          x={contextMenu.x}
          y={contextMenu.y}
          canDelete={threads.length > 1 && !contextThread.system}
          canPin={contextThread.pinned || pinnedCount < MAX_PINNED}
          pinLimit={MAX_PINNED}
          onPin={() => togglePin(contextThread.id)}
          onDelete={() => deleteThread(contextThread.id)}
          onToggleUnread={() => toggleUnread(contextThread.id)}
          onEdit={() => startEditingThread(contextThread.id)}
          onClose={closeContextMenu}
        />
      ) : null}

      {editingThread ? (
        <EditAgentDialog
          thread={editingThread}
          nameLocked={Boolean(editingThread.system)}
          onClose={() => setEditingId(null)}
          onSave={saveEditedAgent}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsView
          status={hermesStatus}
          onClose={() => setSettingsOpen(false)}
          onStatusChange={setHermesStatus}
        />
      ) : null}

      {createOpen ? (
        <CreateAgentDialog
          candidates={createCandidates}
          onClose={closeCreateDialog}
          onCreateBot={handleCreateBot}
          onCreateGroup={handleCreateGroup}
        />
      ) : null}
    </div>
  );
}
