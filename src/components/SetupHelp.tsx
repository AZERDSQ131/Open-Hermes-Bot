import { useEffect, useRef } from 'react';
import type { Help } from '../setupHelp';

/**
 * What a failed read or a quiet port means, said in the page's own voice.
 *
 * The same block is drawn by the first run and by the settings: a person
 * meets the API server being off in one of the two, and the answer should
 * not depend on which. The words live in `src/setupHelp.ts`; this only lays
 * them out, and hides the raw output of a shell behind Details.
 *
 * The block arrives under a page that was already full, in a stage whose
 * scrollbar is not drawn: it moves itself into view, by the smallest amount
 * that shows it, or the answer would sit under the fold.
 */
export function SetupHelp({ help }: { help: Help }) {
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    node.current?.scrollIntoView({ block: 'nearest' });
  }, [help]);

  return (
    <div className="setup-help" ref={node}>
      <p className="setup-help-title">{help.title}</p>
      {help.lines.map((line) => (
        <p key={line} className="setup-help-line">
          {line}
        </p>
      ))}
      {help.code ? (
        <pre className="setup-help-code">
          <code>{help.code.join('\n')}</code>
        </pre>
      ) : null}
      {help.after ? <p className="setup-help-line">{help.after}</p> : null}
      {help.details ? (
        <details className="setup-help-details">
          <summary>Details</summary>
          <pre className="setup-help-output">
            <code>{help.details}</code>
          </pre>
        </details>
      ) : null}
    </div>
  );
}
