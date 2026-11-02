/**
 * What the screens show. Nothing here talks to a host: the mobile app is a
 * front-end, and this file is the transcript it draws.
 */

import type { BloubShape } from './bloubFrames';

export type Bot = {
  id: string;
  name: string;
  shape: BloubShape;
  color: string;
  role: string;
  session: string;
};

export type Reaction = { emoji: string; count: number };

export type MessageKind = 'text' | 'voice' | 'attachment';

export type Attachment = { name: string; size: string };

export type Message = {
  id: string;
  /** 'user', or the id of the bot that said it. */
  from: string;
  text: string;
  kind?: MessageKind;
  attachment?: Attachment;
  /** A voice note carries how long it ran. */
  duration?: string;
  /** Said rather than typed: the bubble sets it in italics. */
  dictated?: boolean;
  /** Why an answer stopped before its end; the words already said remain. */
  interrupted?: string;
  reaction?: Reaction;
};

export type Thread = {
  id: string;
  kind: 'bot' | 'group';
  /** The bot, or the first member of a group. */
  botId: string;
  name: string;
  preview: string;
  time: string;
  unread?: boolean;
  threadModel: string;
  /** Kept at the top of the conversation list. */
  pinned?: boolean;
  /** Set while a turn is being written. */
  typing?: boolean;
  /** The Hermes session behind this thread, once there is one. */
  sessionId?: string;
  /** Group only: the bots in the round, in speaking order. */
  members?: string[];
  /** Group only: the line under the name in the header. */
  subtitle?: string;
};

export type Model = { mark: string; name: string; meta?: string; tag?: string };
export type ModelGroup = { group: string; models: Model[] };

export const BOTS: Record<string, Bot> = {
  chief: {
    id: 'chief',
    name: 'Chief of Staff',
    shape: 'cercle',
    color: '#8b5cf6',
    role: 'Default',
    session: '0b77',
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    shape: 'capsule',
    color: '#4f9d8f',
    role: 'Deploy',
    session: '4f2a',
  },
  june: {
    id: 'june',
    name: 'June',
    shape: 'nuage',
    color: '#e152b0',
    role: 'Writing',
    session: '9c1d',
  },
  rook: {
    id: 'rook',
    name: 'Rook',
    shape: 'hexagone',
    color: '#3f6fd1',
    role: 'Pricing',
    session: 'a310',
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    shape: 'galet',
    color: '#e09248',
    role: 'Research',
    session: 'c802',
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    shape: 'goutte',
    color: '#2fbfa0',
    role: 'Notes',
    session: '1d44',
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    shape: 'triangle',
    color: '#e5484d',
    role: 'Incidents',
    session: '7e10',
  },
  lyra: {
    id: 'lyra',
    name: 'Lyra',
    shape: 'squircle',
    color: '#7a5bc2',
    role: 'Voice',
    session: 'b2c8',
  },
  moss: {
    id: 'moss',
    name: 'Moss',
    shape: 'capsule',
    color: '#3ecf8e',
    role: 'Calendar',
    session: '5aa1',
  },
  pixel: {
    id: 'pixel',
    name: 'Pixel',
    shape: 'hexagone',
    color: '#5b5bda',
    role: 'Design',
    session: 'd904',
  },
};

export const PINNED = ['chief', 'atlas', 'june'];

export const CREW = ['atlas', 'june', 'chief'];

export const LAUNCH = ['june', 'rook', 'pixel'];

export const NIGHT = ['sage', 'ember', 'moss'];

export const DEFAULT_MODEL = 'Sonnet 4.5';

export const THREADS: Thread[] = [
  {
    id: 'crew',
    kind: 'group',
    botId: 'atlas',
    name: 'Crew',
    preview: 'Atlas · Deploy 412 is green.',
    time: '2m',
    unread: true,
    pinned: true,
    threadModel: DEFAULT_MODEL,
    members: CREW,
    subtitle: '3 bots · one session each',
  },
  {
    id: 'chief-thread',
    kind: 'bot',
    botId: 'chief',
    name: 'Chief of Staff',
    preview: 'Your week, condensed — three things.',
    time: '9:41',
    pinned: true,
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'atlas-thread',
    kind: 'bot',
    botId: 'atlas',
    name: 'Atlas',
    preview: 'Rollback path is tested. Opening #218.',
    time: '14:02',
    pinned: true,
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'june-thread',
    kind: 'bot',
    botId: 'june',
    name: 'June',
    preview: 'Launch note drafted. 240 words.',
    time: 'Tue',
    pinned: true,
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'rook-thread',
    kind: 'bot',
    botId: 'rook',
    name: 'Rook',
    preview: 'Two options for the pricing page.',
    time: 'Mon',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'sage-thread',
    kind: 'bot',
    botId: 'sage',
    name: 'Sage',
    preview: 'I kept the three alt routes, all green.',
    time: 'Sun',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'nova-thread',
    kind: 'bot',
    botId: 'nova',
    name: 'Nova',
    preview: 'The interview notes are in the vault.',
    time: 'Sat',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'launch',
    kind: 'group',
    botId: 'june',
    name: 'Launch',
    preview: 'Rook · Two options: one page per tier.',
    time: '1h',
    unread: true,
    threadModel: DEFAULT_MODEL,
    members: LAUNCH,
    subtitle: '3 bots · one session each',
  },
  {
    id: 'night',
    kind: 'group',
    botId: 'sage',
    name: 'Night Watch',
    preview: 'Ember · Nothing on fire.',
    time: '3h',
    threadModel: DEFAULT_MODEL,
    members: NIGHT,
    subtitle: '3 bots · one session each',
  },
  {
    id: 'ember-thread',
    kind: 'bot',
    botId: 'ember',
    name: 'Ember',
    preview: 'One alert at 03:12, autoscaled.',
    time: 'Fri',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'lyra-thread',
    kind: 'bot',
    botId: 'lyra',
    name: 'Lyra',
    preview: 'Say the word and I read the 240 words.',
    time: 'Thu',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'moss-thread',
    kind: 'bot',
    botId: 'moss',
    name: 'Moss',
    preview: 'Nothing after 16:00.',
    time: 'Wed',
    threadModel: DEFAULT_MODEL,
  },
  {
    id: 'pixel-thread',
    kind: 'bot',
    botId: 'pixel',
    name: 'Pixel',
    preview: 'The switch wins on mobile.',
    time: 'Tue',
    threadModel: DEFAULT_MODEL,
  },
];

export const MESSAGES: Record<string, Message[]> = {
  'chief-thread': [
    {
      id: 'c1',
      from: 'chief',
      text: 'Morning. I read the three releases before you woke up. Nothing broke; two things are worth your attention.',
    },
    { id: 'c2', from: 'user', text: 'Keep it short. One line per fix.' },
    {
      id: 'c3',
      from: 'chief',
      text: 'Done.\n\n• Deploy 412 — green, rollback tested.\n• Billing webhook — retried twice, then delivered.\n• Search index — rebuilt overnight.',
      reaction: { emoji: '👍', count: 1 },
    },
    { id: 'c4', from: 'user', text: 'And open a PR for the mobile shell.' },
    {
      id: 'c5',
      from: 'chief',
      text: 'Opened #218. It only touches the composer, so it can ship before the rest.',
    },
  ],
  crew: [
    {
      id: 'g1',
      from: 'atlas',
      text: 'Deploy 412 is green. Rollback path tested twice.',
      reaction: { emoji: '👍', count: 2 },
    },
    {
      id: 'g2',
      from: 'june',
      text: 'Launch note is drafted. 240 words, no exclamation marks.',
      reaction: { emoji: '🎯', count: 1 },
    },
    {
      id: 'g3',
      from: 'user',
      text: 'Ship the note after the deploy. @Atlas keep an eye on errors.',
    },
    {
      id: 'g4',
      from: 'chief',
      text: 'Noted. I’ll report at 18:00 unless something moves.',
      reaction: { emoji: '👀', count: 1 },
    },
  ],
  'atlas-thread': [
    {
      id: 'a1',
      from: 'atlas',
      text: 'Rollback path is tested. Opening #218 with the revert script and the two failing cases.',
    },
    { id: 'a2', from: 'user', text: 'Good. Nothing else in that PR.' },
  ],
  'june-thread': [
    {
      id: 'j1',
      from: 'june',
      text: 'Launch note drafted. 240 words, one quote from the beta, no exclamation marks.',
    },
  ],
  'rook-thread': [
    {
      id: 'r1',
      from: 'rook',
      text: 'Two options for the pricing page: one page per tier, or one page and a switch. The switch is honest, the pages are clearer.',
    },
  ],
  'sage-thread': [
    {
      id: 's1',
      from: 'sage',
      text: 'I kept the three alt routes, all green. The middle one is 40 lines shorter.',
    },
  ],
  'nova-thread': [
    {
      id: 'n1',
      from: 'nova',
      text: 'The interview notes are in the vault. Six sessions, three themes.',
    },
  ],
  launch: [
    {
      id: 'l1',
      from: 'rook',
      text: 'Two options: one page per tier, or one page and a switch.',
      reaction: { emoji: '👍', count: 2 },
    },
    {
      id: 'l2',
      from: 'june',
      text: "I'll draft the announcement — 120 words, same voice as the launch note.",
    },
    {
      id: 'l3',
      from: 'user',
      text: 'Pricing page goes live Thursday. @Rook, what are the options?',
    },
    {
      id: 'l4',
      from: 'pixel',
      text: 'Mocked both. The switch wins on mobile.',
      reaction: { emoji: '🎯', count: 1 },
    },
  ],
  night: [
    {
      id: 'w1',
      from: 'sage',
      text: 'Three routes checked, all green. The middle one is 40 lines shorter.',
    },
    {
      id: 'w2',
      from: 'ember',
      text: 'One alert at 03:12, autoscaled. Nothing on fire.',
      reaction: { emoji: '👍', count: 1 },
    },
    {
      id: 'w3',
      from: 'user',
      text: 'Anything I should know before bed?',
    },
    {
      id: 'w4',
      from: 'moss',
      text: 'Thursday is clear after 16:00. Sleep well.',
    },
  ],
  'ember-thread': [
    { id: 'e1', from: 'user', text: 'Anything on fire right now?' },
    {
      id: 'e2',
      from: 'ember',
      text: 'One alert at 03:12 — autoscaled before I woke up. Nothing on fire.',
    },
  ],
  'lyra-thread': [
    { id: 'y1', from: 'user', text: 'Read the launch note back to me.' },
    {
      id: 'y2',
      from: 'lyra',
      text: "Ready when you are — say the word and I'll read the 240 words, no exclamation marks.",
    },
  ],
  'moss-thread': [
    { id: 'm1', from: 'user', text: "What's Thursday look like?" },
    {
      id: 'm2',
      from: 'moss',
      text: 'Three blocks: deploy review at 10:00, dentist at 14:30, and nothing after 16:00.',
    },
  ],
  'pixel-thread': [
    { id: 'p1', from: 'user', text: 'The settings page feels cramped.' },
    {
      id: 'p2',
      from: 'pixel',
      text: 'Opened it up: more air, one column, and the toggle stays where your thumb is.',
    },
  ],
};

export const CHAT_EVENTS: Record<string, { event: string; time: string; typing?: boolean }> = {
  crew: { event: '3 bots joined · sessions kept separate', time: 'Today · 14:04', typing: true },
  'chief-thread': { event: 'Session started yesterday, 09:12', time: 'Today · 14:02' },
};

export const MODELS: ModelGroup[] = [
  { group: 'Configured', models: [{ mark: 'H', name: 'Hermes default', meta: 'Sonnet 4.5' }] },
  { group: 'Favorites', models: [{ mark: 'C', name: 'Claude Sonnet 4.5', tag: 'current' }] },
  { group: 'Anthropic', models: [{ mark: 'C', name: 'Claude Opus 4.1', meta: '200k' }] },
  { group: 'OpenAI', models: [{ mark: 'G', name: 'GPT-5.2', meta: '400k' }] },
  { group: 'Google', models: [{ mark: 'G', name: 'Gemini 3 Pro', meta: '1M' }] },
  { group: 'xAI', models: [{ mark: 'X', name: 'Grok 4.1', meta: '256k' }] },
];

/** The eight dots of the create sheet, in the order the mockup draws them. */
export const COLORS = [
  '#4f9d8f',
  '#2fbfa0',
  '#3f6fd1',
  '#5b5bda',
  '#7a5bc2',
  '#e152b0',
  '#e09248',
  '#3ecf8e',
];

export const SHAPES: { id: BloubShape; label: string }[] = [
  { id: 'cercle', label: 'Circle' },
  { id: 'galet', label: 'Pebble' },
  { id: 'squircle', label: 'Squircle' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hexagone', label: 'Hexagon' },
  { id: 'nuage', label: 'Cloud' },
  { id: 'goutte', label: 'Drop' },
];

/** What the host is: the line under every face, and the settings card. */
export const HOST = {
  name: 'mac-studio',
  version: '1.1.0',
  connection: 'SSH · 8642',
};

/** The preferences the settings pages edit. Nothing is written to disk. */
export type Prefs = {
  host: string;
  apiPort: string;
  localPort: string;
  sshHost: string;
  defaultModel: string;
  voice: 'host' | 'device';
  autoUpdate: boolean;
  connected: boolean;
};

export const PREFS: Prefs = {
  host: HOST.name,
  apiPort: '8642',
  localPort: '18742',
  sshHost: 'mac-studio.local',
  defaultModel: DEFAULT_MODEL,
  voice: 'host',
  autoUpdate: true,
  connected: true,
};

/** The canned things the attach sheet can hand over, since nothing is read. */
export const ATTACHMENTS: { kind: string; name: string; size: string }[] = [
  { kind: 'Photo', name: 'IMG_4821.HEIC', size: '2.4 MB' },
  { kind: 'File', name: 'deploy-notes.md', size: '12 KB' },
  { kind: 'Camera', name: 'Photo · 14:06', size: '1.8 MB' },
];
