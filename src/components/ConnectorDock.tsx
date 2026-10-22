import { useState } from 'react';
import type { Connector } from '../connectors';

/**
 * The mark of a connector, in the dock.
 *
 * The logos live on the vendor's own service, and the app draws them when
 * they come. When they do not, the first letter of the name stands in: a
 * tile with nothing in it says nothing.
 */
function Mark({ row }: { row: Connector }) {
  const [failed, setFailed] = useState(false);
  if (!row.logo || failed) {
    return (
      <span className="dock-mark is-letter" aria-hidden="true">
        {row.name.slice(0, 1).toUpperCase() || '?'}
      </span>
    );
  }
  return (
    <span className="dock-mark" aria-hidden="true">
      <img src={row.logo} alt="" onError={() => setFailed(true)} />
    </span>
  );
}

/**
 * The dock of the connectors, at the bottom of the sidebar.
 *
 * The marks are the services the host offers; pressing them opens the page
 * of the settings where the connectors are listed.
 */
export function ConnectorDock({
  rows,
  onOpen,
}: {
  rows: Connector[];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="footer-dock"
      onClick={onOpen}
      aria-label="Connectors"
      title="Connectors"
    >
      {rows.map((row) => (
        <Mark key={row.slug} row={row} />
      ))}
    </button>
  );
}
