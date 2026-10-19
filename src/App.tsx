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
  type CreateCandidate,
} from './components/CreateAgentDialog';
import { EditAgentDialog } from './components/EditAgentDialog';
import {
  ArrowUpIcon,
  MenuIcon,
  MicIcon,
  MonitorIcon,
  PlusIcon,
  SearchIcon,
} from './components/Icons';
import { LogoEditor } from './components/LogoEditor';
import { ThreadContextMenu } from './components/ThreadContextMenu';
import {
  THREADS,
  type AvatarSpec,
  type BotStyle,
  type Message,
  type Thread,
} from './data';

const REPLY_TEXT =
  "On it. I'll take the first pass tonight and leave everything in your review queue by morning.";

const MAX_PINNED = 3;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}


export default function App() {
  const [threads, setThreads] = useState<Thread[]>(THREADS);
  const [activeId, setActiveId] = useState('sales-outbound');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
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

  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const renameCancelled = useRef(false);
  const timers = useRef<number[]>([]);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const activeThread =
    threads.find((thread) => thread.id === activeId) ?? threads[0];

  const orderedThreads = useMemo(
    () =>
      [...threads].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
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
        { id: thread.id, name: thread.name, avatar: thread.avatar },
      ];
    });
  }, [threads]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
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
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, [activeId, activeThread?.messages.length, activeThread?.thinking]);

  function selectThread(id: string) {
    setActiveId(id);
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id && thread.unread
          ? { ...thread, unread: false }
          : thread,
      ),
    );
    setAttachments([]);
    setListening(false);
    setLogoOpen(false);
    setRenaming(false);
    setContextMenu(null);
    setSidebarOpen(false);
    composerRef.current?.blur();
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
    setAttachments([]);
    setListening(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function handleCreateBot(input: {
    name: string;
    shape: BloubShape;
    color: string;
  }) {
    addThread({
      id: `agent-${uid()}`,
      name: input.name,
      avatar: {
        color: input.color,
        shape: input.shape,
        variant: 'neutral',
      },
      preview: 'Start a conversation',
      time: 'Now',
      chatTime: 'Now',
      messages: [],
    });
  }

  function handleCreateGroup(input: { name: string; members: BotStyle[] }) {
    addThread({
      id: `group-${uid()}`,
      name: input.name,
      avatar: { kind: 'group', members: input.members },
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
    if (threads.length <= 1) return;
    const index = orderedThreads.findIndex((thread) => thread.id === id);
    const fallback =
      orderedThreads[index + 1] ?? orderedThreads[index - 1] ?? null;

    setThreads((current) => current.filter((thread) => thread.id !== id));

    if (activeId === id) {
      if (fallback) setActiveId(fallback.id);
      setAttachments([]);
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
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id ? { ...thread, ...input } : thread,
      ),
    );
    setEditingId(null);
  }

  function updateActiveAvatar(avatar: AvatarSpec) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeId ? { ...thread, avatar } : thread,
      ),
    );
  }

  function startRenaming() {
    setNameDraft(activeThread.name);
    renameCancelled.current = false;
    setLogoOpen(false);
    setRenaming(true);
  }

  function commitRename() {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setRenaming(false);
      return;
    }
    const nextName = nameDraft.trim();
    if (nextName && nextName !== activeThread.name) {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeThread.id ? { ...thread, name: nextName } : thread,
        ),
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
    autoSize(event.target);
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text || !activeThread) return;

    const threadId = activeThread.id;
    const outgoing = attachments.length
      ? `${text}\n\nAttached: ${attachments.join(', ')}`
      : text;
    const userMessage: Message = { id: uid(), role: 'user', text: outgoing };

    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              messages: [...thread.messages, userMessage],
              thinking: true,
              preview: text,
            }
          : thread,
      ),
    );

    setDraft('');
    setAttachments([]);
    setListening(false);
    if (composerRef.current) {
      composerRef.current.style.height = '40px';
    }

    const timer = window.setTimeout(() => {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                thinking: false,
                preview: REPLY_TEXT,
                messages: [
                  ...thread.messages,
                  { id: uid(), role: 'assistant', text: REPLY_TEXT },
                ],
              }
            : thread,
        ),
      );
    }, 2300);

    timers.current.push(timer);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
    const files = Array.from(event.target.files ?? []).map((file) => file.name);
    if (files.length) {
      setAttachments((current) => [...current, ...files]);
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
      </aside>

      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Close agents"
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />

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

        <div className="chat-scroll" ref={scrollRef}>
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
                    ? 'Give the crew a job. It works while you sleep.'
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
                      className={`message-row ${message.role}`}
                      key={message.id}
                    >
                      <div className={`bubble bubble-${message.role}`}>
                        {message.text}
                      </div>
                    </div>
                  ),
                )}

                {activeThread.thinking ? (
                  <div className="thinking-row">
                    <AgentAvatar
                      avatar={activeThread.avatar}
                      size={38}
                      className="thinking-avatar"
                      showBadge={false}
                    />
                    <span className="thinking-label">Thinking</span>
                  </div>
                ) : (
                  <div className="chat-tail" />
                )}
              </>
            )}
          </div>
        </div>

        <div className="composer-dock">
          <div className="composer-inner">
            {attachments.length > 0 ? (
              <div className="attachment-row">
                {attachments.map((name, index) => (
                  <span className="attachment" key={`${name}-${index}`}>
                    <span className="attachment-name">{name}</span>
                    <button
                      type="button"
                      className="attachment-remove"
                      aria-label={`Remove ${name}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <form className="composer" onSubmit={handleSubmit}>
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
                    : `Message ${activeThread.name}`
                }
                onChange={handleDraftChange}
                onKeyDown={handleComposerKeyDown}
                aria-label={`Message ${activeThread.name}`}
              />
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
            </form>
          </div>
        </div>
      </main>

      {contextMenu && contextThread ? (
        <ThreadContextMenu
          thread={contextThread}
          x={contextMenu.x}
          y={contextMenu.y}
          canDelete={threads.length > 1}
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
          onClose={() => setEditingId(null)}
          onSave={saveEditedAgent}
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
