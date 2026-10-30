import type { BloubShape, BloubVariant } from './components/bloubFrames';
import type { ApprovalRequest } from './approvals';

export type BotStyle = {
  color: string;
  shape: BloubShape;
  variant?: BloubVariant;
};

export type SingleAvatar = BotStyle & {
  kind?: 'single';
};

export type GroupAvatar = {
  kind: 'group';
  members: BotStyle[];
};

export type AvatarSpec = SingleAvatar | GroupAvatar;

/**
 * A bot that belongs to a group. `profile` is what Hermes answers for; `id`
 * points back at the bot's own thread, so a member stays the same bot across
 * renames and refreshes.
 */
export type GroupMember = {
  id: string;
  name: string;
  profile?: string;
  avatar: SingleAvatar;
};

/** A tapback, and the bot that left it. */
export type Reaction = {
  emoji: string;
  /** The bot that left it; absent when the bot is not named. */
  by?: string;
};

/** A command a bot is holding, and who is waiting on it. */
export type PendingApproval = {
  approval: ApprovalRequest;
  /** The bot, or the group member that asked. */
  botName?: string;
  /** The profile the answer is posted under. */
  profile?: string;
};

/**
 * A group member whose answer is arriving right now. Several of these exist
 * at once: a group turn asks every member in parallel, not one by one.
 */
export type LiveGroupTurn = {
  requestId: string;
  member: GroupMember;
  text: string;
  tool?: string;
};

export type Message =
  | {
      id: string;
      role: 'assistant' | 'user';
      text: string;
      /** Emoji the agent tapped on this message; never sent back to Hermes. */
      reaction?: string;
      /** Group chat: the bot that wrote this line. */
      authorId?: string;
      authorName?: string;
      /** Group chat: the author's face, kept with the line. */
      authorAvatar?: SingleAvatar;
      /** Group chats collect one tapback per bot instead of a single one. */
      reactions?: Reaction[];
      /** Bots named with @ in this line. */
      mentions?: string[];
    }
  | { id: string; role: 'event'; text: string };

export type Thread = {
  id: string;
  name: string;
  /** Hermes profile backing this bot, when it is one. */
  profile?: string;
  /**
   * Warming bot: created on the host but not served by the gateway yet.
   * Shown immediately, with a loading screen until Hermes answers.
   */
  pending?: boolean;
  /** When the warming started, for the auto-cleanup timeout. */
  pendingSince?: number;
  /** The gateway still does not serve it: shown as failed, removed soon. */
  serveFailed?: boolean;
  /**
   * The default bot (Chief of Staff), backed by the primary Hermes profile:
   * always present, always first, and never deletable.
   */
  system?: boolean;
  /** Hermes session this conversation lives in, once it has been opened. */
  sessionId?: string;
  /** Group members, when this thread is a group. */
  members?: GroupMember[];
  /**
   * Group members each keep their own Hermes session: the bot that answers
   * stays the same bot, with its own memory, across the whole conversation.
   */
  sessions?: Record<string, string>;
  /** Group members composing at this moment — one row per live request. */
  live?: LiveGroupTurn[];
  /** Model picked for this conversation; absent means the bot's own. */
  model?: string;
  modelProvider?: string;
  /** Human label for the picked model, for the composer chip. */
  modelLabel?: string;
  /** Text arriving right now, before the turn is committed. */
  streaming?: string;
  /** Tool the bot is using right now, if any. */
  tool?: string;
  /**
   * The commands bots are holding for an answer. A turn is paused until each
   * is answered, and the card lives with the thread: in a group the member
   * that asked is named on it.
   */
  approvals?: PendingApproval[];
  avatar: AvatarSpec;
  preview: string;
  time: string;
  chatTime: string;
  thinking?: boolean;
  pinned?: boolean;
  unread?: boolean;
  messages: Message[];
};
