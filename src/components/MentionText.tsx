import type { GroupMember } from '../data';
import { splitMentions } from '../group';

type MentionTextProps = {
  text: string;
  members?: GroupMember[];
};

/**
 * A line in a group, with the bots it names picked out. The text is unchanged
 * — only wrapped — so what the model wrote is exactly what stays in the bubble.
 */
export function MentionText({ text, members }: MentionTextProps) {
  if (!members?.length) return <>{text}</>;
  return (
    <>
      {splitMentions(text, members).map((segment, index) =>
        segment.mention ? (
          <span className="mention" key={index}>
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
