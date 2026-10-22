import type { Connector } from '../connectors';
import { ConnectorMark } from './ConnectorMark';

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
        <ConnectorMark key={row.slug} row={row} className="dock-mark" />
      ))}
    </button>
  );
}
