import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Reaction } from '../data';

/** The emoji the sheet offers: the ones a hand reaches for first. */
export const REACTION_EMOJI = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '🔥',
  '🎉',
  '👏',
  '🤝',
  '👀',
  '💡',
  '✅',
  '🫡',
  '😎',
  '🤔',
  '🙌',
  '✨',
];

/** The reactions of one message, gathered by emoji: one pill per emoji. */
export type ReactionGroup = {
  emoji: string;
  /** How many left it, yours included. */
  count: number;
  /** The person left this one. */
  mine: boolean;
  /** The bots that left it. */
  by: string[];
};

export function groupReactions(reactions: Reaction[]): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const reaction of reactions) {
    const group = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
      by: [],
    };
    group.count += 1;
    if (reaction.mine) group.mine = true;
    if (reaction.by) group.by.push(reaction.by);
    groups.set(reaction.emoji, group);
  }
  return [...groups.values()];
}

type Props = {
  /** Where the pointer was, in screen pixels. */
  x: number;
  y: number;
  /** The emoji already on the message, shown as picked. */
  picked: string[];
  onPick: (emoji: string) => void;
  onClose: () => void;
};

/**
 * The reaction sheet: a big panel of emoji, the way a message answers to a
 * right click. It keeps itself on the screen and closes on anything that
 * takes the conversation away from it.
 */
export function ReactionSheet({ x, y, picked, onPick, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(
      Math.max(margin, x),
      Math.max(margin, window.innerWidth - box.width - margin),
    );
    // Above the message when there is room, below it otherwise.
    const above = y - box.height - margin;
    const top = above < margin ? y + margin : above;
    setSpot({ left, top });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      className="reaction-sheet"
      ref={panelRef}
      style={{ left: spot.left, top: spot.top }}
      role="dialog"
      aria-label="React to this message"
    >
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`sheet-emoji${picked.includes(emoji) ? ' is-picked' : ''}`}
          aria-label={`React with ${emoji}`}
          title={emoji}
          onClick={() => {
            onPick(emoji);
            onClose();
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
