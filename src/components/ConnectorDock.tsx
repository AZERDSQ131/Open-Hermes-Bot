import type { Connector } from '../connectors';
import { ConnectorMark } from './ConnectorMark';

/**
 * The services the empty dock previews, with their real marks. No plug:
 * the button shows what connecting opens — Notion, Drive, Calendar — and
 * the page behind it says where the services are.
 */
const PREVIEW_ROWS: Connector[] = [
  {
    slug: 'notion',
    name: 'Notion',
    description: '',
    category: '',
    logo: '',
    state: 'available',
    enabled: true,
    account: '',
  },
  {
    slug: 'googledrive',
    name: 'Google Drive',
    description: '',
    category: '',
    logo: '',
    state: 'available',
    enabled: true,
    account: '',
  },
  {
    slug: 'googlecalendar',
    name: 'Google Calendar',
    description: '',
    category: '',
    logo: '',
    state: 'available',
    enabled: true,
    account: '',
  },
];

/**
 * The dock of the connectors, at the bottom of the sidebar.
 *
 * The marks are the services the host offers; pressing them opens the page
 * of the settings where the connectors are listed. When the host offers
 * none, the dock previews the services with their real marks instead of a
 * plug, and the page behind it says where the services are.
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
      {(rows.length ? rows : PREVIEW_ROWS).map((row) => (
        <ConnectorMark key={row.slug} row={row} className="dock-mark" />
      ))}
    </button>
  );
}
