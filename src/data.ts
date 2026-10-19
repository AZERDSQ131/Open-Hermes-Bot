import type { BloubShape, BloubVariant } from './components/bloubFrames';

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

export type Message =
  | {
      id: string;
      role: 'assistant' | 'user';
      text: string;
      /** Emoji the agent tapped on this message; never sent back to Hermes. */
      reaction?: string;
    }
  | { id: string; role: 'event'; text: string };

export type Thread = {
  id: string;
  name: string;
  /** Hermes profile backing this bot, when it is one. */
  profile?: string;
  /**
   * The default bot (Chief of Staff), backed by the primary Hermes profile:
   * always present, always first, and never deletable.
   */
  system?: boolean;
  /** Hermes session this conversation lives in, once it has been opened. */
  sessionId?: string;
  /** Model picked for this conversation; absent means the bot's own. */
  model?: string;
  modelProvider?: string;
  /** Human label for the picked model, for the composer chip. */
  modelLabel?: string;
  /** Text arriving right now, before the turn is committed. */
  streaming?: string;
  /** Tool the bot is using right now, if any. */
  tool?: string;
  avatar: AvatarSpec;
  preview: string;
  time: string;
  chatTime: string;
  thinking?: boolean;
  pinned?: boolean;
  unread?: boolean;
  messages: Message[];
};
