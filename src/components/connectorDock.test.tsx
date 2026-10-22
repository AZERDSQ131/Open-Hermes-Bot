import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectorDock } from './ConnectorDock';
import type { Connector } from '../connectors';

const ROWS: Connector[] = [
  {
    slug: 'notion',
    name: 'Notion',
    description: 'Your pages',
    category: 'Documents',
    logo: 'https://logos.composio.dev/api/notion',
    state: 'connected',
    enabled: true,
    account: 'jules@acme.com',
  },
  {
    slug: 'google_maps',
    name: 'Google Maps',
    description: '',
    category: 'Places',
    logo: '',
    state: 'available',
    enabled: true,
    account: '',
  },
];

/** The picture the shell hands over: the bytes, as a data url. */
const MARK = 'data:image/png;base64,iVBORw0KGgo=';

function withShell(answer: { ok: boolean; logo?: string } = { ok: true, logo: MARK }) {
  const connectorLogo = vi.fn(async () => answer);
  (window as unknown as { hermes: unknown }).hermes = { connectorLogo };
  return connectorLogo;
}

describe('the dock of the connectors', () => {
  it('shows a mark for every connector it is given', async () => {
    withShell();
    const { container } = render(<ConnectorDock rows={ROWS} onOpen={vi.fn()} />);
    const dock = screen.getByRole('button', { name: 'Connectors' });
    expect(dock.querySelectorAll('.dock-mark')).toHaveLength(2);
    // The picture is the bytes the shell fetched, not an address the page
    // would have had to go and get.
    await waitFor(() => {
      expect(container.querySelector('.dock-mark img')?.getAttribute('src')).toBe(MARK);
    });
  });

  it('asks the shell for the mark, and not the page', async () => {
    const connectorLogo = withShell();
    render(<ConnectorDock rows={ROWS} onOpen={vi.fn()} />);
    await waitFor(() => {
      expect(connectorLogo).toHaveBeenCalledWith({
        url: 'https://logos.composio.dev/api/notion',
      });
    });
  });

  it('falls back on the brand mark and the letter when pictures do not come', async () => {
    withShell({ ok: false, logo: '' });
    render(<ConnectorDock rows={ROWS} onOpen={vi.fn()} />);
    const dock = screen.getByRole('button', { name: 'Connectors' });
    // Notion draws its real brand mark; only the unknown service stands in
    // with the first letter of its name.
    const letters = [...dock.querySelectorAll('.dock-mark.is-letter')].map(
      (tile) => tile.textContent,
    );
    expect(letters).toEqual(['G']);
    expect(dock.querySelectorAll('.dock-mark svg')).toHaveLength(1);
  });

  it('opens the page where the connectors are listed', async () => {
    const onOpen = vi.fn();
    render(<ConnectorDock rows={ROWS} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('holds three marks side by side in one wide pill', async () => {
    withShell({ ok: false, logo: '' });
    const three: Connector[] = [
      ...ROWS,
      {
        slug: 'google_calendar',
        name: 'Google Calendar',
        description: '',
        category: 'Calendar',
        logo: '',
        state: 'connected',
        enabled: true,
        account: '',
      },
    ];
    render(<ConnectorDock rows={three} onOpen={vi.fn()} />);
    const dock = screen.getByRole('button', { name: 'Connectors' });
    expect(dock.classList.contains('footer-dock')).toBe(true);
    expect(dock.querySelectorAll('.dock-mark')).toHaveLength(3);
  });
});
