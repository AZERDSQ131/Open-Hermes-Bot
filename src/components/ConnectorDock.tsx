import type { Connector } from '../connectors';
import { ConnectorMark } from './ConnectorMark';
import { PlugIcon } from './Icons';

/**
 * The dock of the connectors, at the bottom of the sidebar.
 *
 * The marks are the services the host offers; pressing them opens the page
 * of the settings where the connectors are listed. When the host offers
 * none, the dock still shows a plug: an empty slot says nothing, and the
 * page behind it says where the services are.
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
      {rows.length ? (
        rows.map((row) => (
          <ConnectorMark key={row.slug} row={row} className="dock-mark" />
        ))
      ) : (
        <span className="dock-mark is-plug" aria-hidden="true">
          <PlugIcon size={13} />
        </span>
      )}
    </button>
  );
}
