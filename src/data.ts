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
  | { id: string; role: 'assistant' | 'user'; text: string }
  | { id: string; role: 'event'; text: string };

export type Thread = {
  id: string;
  name: string;
  /** Hermes profile backing this bot, when it is one. */
  profile?: string;
  avatar: AvatarSpec;
  preview: string;
  time: string;
  chatTime: string;
  thinking?: boolean;
  pinned?: boolean;
  unread?: boolean;
  messages: Message[];
};

export const THREADS: Thread[] = [
  {
    id: 'chief',
    name: 'Chief',
    avatar: { color: '#4f9d8f', shape: 'cercle', variant: 'neutral' },
    preview: 'booked the venue and sent the calendar invite',
    time: '3:02 AM',
    chatTime: '3:02 AM',
    messages: [
      {
        id: 'chief-1',
        role: 'assistant',
        text: "Venue's booked for Thursday at 7. I sent the invite to everyone, put the deposit on the corp card, and added a note about the AV setup.",
      },
      {
        id: 'chief-2',
        role: 'user',
        text: 'Perfect. Add the run of show as soon as the team sends it over.',
      },
      {
        id: 'chief-3',
        role: 'assistant',
        text: "Will do. I'll keep an eye on the thread and drop it in the calendar invite.",
      },
    ],
  },
  {
    id: 'sales-outbound',
    name: 'Sales Outbound',
    avatar: { color: '#e09248', shape: 'cercle', variant: 'neutral' },
    preview: 'Overnight pipeline generation and outbound',
    time: '11:03 PM',
    chatTime: '11:03 PM',
    thinking: true,
    messages: [
      {
        id: 'sales-1',
        role: 'assistant',
        text: 'Hey Armand, good to meet you. What do you want me around for? Anything concrete, or more of a general sidekick?',
      },
      {
        id: 'sales-2',
        role: 'user',
        text: "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice.",
      },
      { id: 'sales-3', role: 'event', text: 'Renamed to Sales Outbound' },
    ],
  },
  {
    id: 'inbox-manager',
    name: 'Inbox Manager',
    avatar: {
      color: '#5b5bda',
      shape: 'cercle',
      variant: 'curious',
    },
    preview: 'inbox at zero, 5 drafts parked for review',
    time: '8:02 PM',
    chatTime: '8:02 PM',
    messages: [
      {
        id: 'inbox-1',
        role: 'assistant',
        text: 'Inbox at zero. I sent the easy replies, archived the noise, and parked 5 drafts for you to read before they go out.',
      },
      {
        id: 'inbox-2',
        role: 'user',
        text: 'Nice. Flag anything from Vicky or the Globex thread.',
      },
      {
        id: 'inbox-3',
        role: 'event',
        text: 'Renamed to Inbox Manager',
      },
    ],
  },
  {
    id: 'account-manager',
    name: 'Account Manager',
    avatar: { color: '#7a5bc2', shape: 'cercle', variant: 'attentive' },
    preview: "invite's out to vicky, globex note attached",
    time: '6:02 PM',
    chatTime: '6:02 PM',
    messages: [
      {
        id: 'account-1',
        role: 'assistant',
        text: "Invite's out to Vicky. I left a note on Globex with the renewal context and tagged you where it needs a human.",
      },
      {
        id: 'account-2',
        role: 'user',
        text: "What's left on my side?",
      },
      {
        id: 'account-3',
        role: 'assistant',
        text: 'Two things: approve the renewal discount and reply to Marcus about the security review. Everything else is handled.',
      },
    ],
  },
  {
    id: 'talent-scout',
    name: 'Talent Scout',
    avatar: { color: '#3f6fd1', shape: 'cercle', variant: 'wide' },
    preview: '3 intros drafted in your voice, held for approval',
    time: '3:02 PM',
    chatTime: '3:02 PM',
    messages: [
      {
        id: 'talent-1',
        role: 'assistant',
        text: '3 intros drafted in your voice: two designers from Linear and one from Stripe. All held for your approval.',
      },
      {
        id: 'talent-2',
        role: 'user',
        text: 'Send the Linear one tonight.',
      },
      {
        id: 'talent-3',
        role: 'assistant',
        text: "Sent. I'll follow up in four days if there's no reply.",
      },
    ],
  },
  {
    id: 'expense-manager',
    name: 'Expense Manager',
    avatar: { color: '#de7b3f', shape: 'cercle', variant: 'wink' },
    preview: 'report filed, 9 receipts, nothing over policy',
    time: '7:02 PM',
    chatTime: '7:02 PM',
    messages: [
      {
        id: 'expense-1',
        role: 'assistant',
        text: 'Report filed. 9 receipts, nothing over policy. The $84 dinner is tagged to the offsite.',
      },
      {
        id: 'expense-2',
        role: 'user',
        text: 'Thanks. What is still missing?',
      },
      {
        id: 'expense-3',
        role: 'assistant',
        text: 'Just the taxi receipt from Tuesday. I already pinged the vendor for a copy.',
      },
    ],
  },
  {
    id: 'offsite-crew',
    name: 'Offsite crew',
    avatar: {
      kind: 'group',
      members: [
        { color: '#4f9d8f', shape: 'cercle', variant: 'neutral' },
        { color: '#7a5bc2', shape: 'cercle', variant: 'attentive' },
        { color: '#3f63b4', shape: 'cercle', variant: 'curious' },
      ],
    },
    preview: "that leaves the pipeline, i'd spin up a doc",
    time: '5:02 PM',
    chatTime: '5:02 PM',
    messages: [
      {
        id: 'offsite-1',
        role: 'assistant',
        text: "I've got the venue, the guest list, and a rough run of show. That leaves the pipeline. I'd spin up a doc so we can hand it off.",
      },
      {
        id: 'offsite-2',
        role: 'user',
        text: 'Keep it light. One page.',
      },
      { id: 'offsite-3', role: 'event', text: 'Offsite crew joined' },
    ],
  },
];
