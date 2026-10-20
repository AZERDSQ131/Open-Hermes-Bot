import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Reaction } from '../data';

/** The reactions of one message, gathered by emoji: one pill per emoji. */
export type ReactionGroup = {
  emoji: string;
  /** How many left it. */
  count: number;
  /** The bots that left it. */
  by: string[];
};

export function groupReactions(reactions: Reaction[]): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const reaction of reactions) {
    const group = groups.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      by: [],
    };
    group.count += 1;
    if (reaction.by) group.by.push(reaction.by);
    groups.set(reaction.emoji, group);
  }
  return [...groups.values()];
}

/** What a group says: who left it. */
export function groupNames(group: ReactionGroup): string {
  if (!group.by.length) return 'Un bot a réagi';
  if (group.by.length === 1) return `${group.by[0]} a réagi`;
  const last = group.by[group.by.length - 1];
  const others = group.by.slice(0, -1).join(', ');
  return `${others} et ${last} ont réagi`;
}

type Props = {
  /** Where the pointer was, in screen pixels. */
  x: number;
  y: number;
  groups: ReactionGroup[];
  onClose: () => void;
};

/**
 * What a tapback opens: the bots that left it, and with what. The panel
 * keeps itself on the screen and closes on anything that takes the
 * conversation away from it.
 */
export function ReactionDetails({ x, y, groups, onClose }: Props) {
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
      className="reaction-details"
      ref={panelRef}
      style={{ left: spot.left, top: spot.top }}
      role="dialog"
      aria-label="Who reacted"
    >
      <div className="reaction-details-title">Réactions</div>
      {groups.map((group) => (
        <div className="reaction-detail" key={group.emoji}>
          <span className="detail-emoji">{group.emoji}</span>
          <span className="detail-names">{groupNames(group)}</span>
        </div>
      ))}
    </div>
  );
}
