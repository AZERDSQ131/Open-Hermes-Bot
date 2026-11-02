import { Fragment } from 'react';
import type { GroupMember } from '../data';
import { splitMatch } from '../find';
import { splitMentions } from '../group';

type MentionTextProps = {
  text: string;
  members?: GroupMember[];
  /** A search in progress: the words are marked, and so is the one being walked. */
  find?: { query: string; firstHit: number; currentHit: number };
};

type Piece = { text: string; occurrence: number | null };
type Segment = { mention: boolean; pieces: Piece[] };

/**
 * A line in a group, with the bots it names picked out. The text is unchanged
 * — only wrapped — so what the model wrote is exactly what stays in the bubble.
 *
 * A search marks the words it found without taking the mentions away: the line
 * is cut in two passes, the names first, then the query inside every piece of
 * it, and the hits keep their number across both so the walk lands on the right
 * one. A name is searched like the rest of the line - it is on the screen - so
 * the count in the bar and the marks always agree; the mark then sits inside the
 * name's pastille, which stays whole.
 */
export function MentionText({ text, members, find }: MentionTextProps) {
  const searching = Boolean(find?.query.trim());
  if (!members?.length && !searching) return <>{text}</>;

  const segments = members?.length
    ? splitMentions(text, members)
    : [{ text, mention: false }];

  const marked: Segment[] = [];
  let occurrence = 0;
  for (const segment of segments) {
    const parts = searching
      ? splitMatch(segment.text, find!.query)
      : [{ text: segment.text, hit: false }];
    const pieces: Piece[] = [];
    for (const part of parts) {
      if (part.hit) {
        pieces.push({ text: part.text, occurrence: find!.firstHit + occurrence });
        occurrence += 1;
      } else if (part.text) {
        pieces.push({ text: part.text, occurrence: null });
      }
    }
    if (pieces.length) marked.push({ mention: Boolean(segment.mention), pieces });
  }

  return (
    <>
      {marked.map((segment, segmentIndex) => {
        const nodes = segment.pieces.map((piece, pieceIndex) =>
          piece.occurrence === null ? (
            <span key={pieceIndex}>{piece.text}</span>
          ) : (
            <mark
              className={`find-hit ${
                piece.occurrence === find!.currentHit ? 'is-current' : ''
              }`}
              key={pieceIndex}
            >
              {piece.text}
            </mark>
          ),
        );
        return segment.mention ? (
          <span className="mention" key={segmentIndex}>
            {nodes}
          </span>
        ) : (
          <Fragment key={segmentIndex}>{nodes}</Fragment>
        );
      })}
    </>
  );
}
