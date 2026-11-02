import type { GroupMember } from '../data';
import { splitMatch } from '../find';
import { splitMentions } from '../group';

type MentionTextProps = {
  text: string;
  members?: GroupMember[];
  /** A search in progress: the words are marked, and so is the one being walked. */
  find?: { query: string; firstHit: number; currentHit: number };
};

type Piece = { text: string; mention: boolean; occurrence: number | null };

/**
 * A line in a group, with the bots it names picked out. The text is unchanged
 * — only wrapped — so what the model wrote is exactly what stays in the bubble.
 *
 * A search marks the words it found without taking the mentions away: the line
 * is cut in two passes, the names first, then the query inside what is left, and
 * the hits keep their number across both so the walk lands on the right one.
 */
export function MentionText({ text, members, find }: MentionTextProps) {
  const searching = Boolean(find?.query.trim());
  if (!members?.length && !searching) return <>{text}</>;

  const segments = members?.length
    ? splitMentions(text, members)
    : [{ text, mention: false }];

  const pieces: Piece[] = [];
  let occurrence = 0;
  for (const segment of segments) {
    if (segment.mention) {
      pieces.push({ text: segment.text, mention: true, occurrence: null });
      continue;
    }
    const parts = searching
      ? splitMatch(segment.text, find!.query)
      : [{ text: segment.text, hit: false }];
    for (const part of parts) {
      if (part.hit) {
        pieces.push({
          text: part.text,
          mention: false,
          occurrence: find!.firstHit + occurrence,
        });
        occurrence += 1;
      } else if (part.text) {
        pieces.push({ text: part.text, mention: false, occurrence: null });
      }
    }
  }

  return (
    <>
      {pieces.map((piece, index) => {
        if (piece.mention) {
          return (
            <span className="mention" key={index}>
              {piece.text}
            </span>
          );
        }
        if (piece.occurrence === null) return <span key={index}>{piece.text}</span>;
        return (
          <mark
            className={`find-hit ${
              piece.occurrence === find!.currentHit ? 'is-current' : ''
            }`}
            key={index}
          >
            {piece.text}
          </mark>
        );
      })}
    </>
  );
}
