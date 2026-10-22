import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('the dock of the connectors', () => {
  it('shows the mark of every connector it is given', () => {
    render(<ConnectorDock rows={ROWS} onOpen={vi.fn()} />);
    const dock = screen.getByRole('button', { name: 'Connectors' });
    expect(dock.querySelectorAll('.dock-mark')).toHaveLength(2);
    expect(dock.querySelector('img')?.getAttribute('src')).toContain('notion');
  });

  it('falls back on the first letter when a mark is missing', () => {
    render(<ConnectorDock rows={ROWS} onOpen={vi.fn()} />);
    const dock = screen.getByRole('button', { name: 'Connectors' });
    expect(dock.querySelector('.dock-mark.is-letter')?.textContent).toBe('G');
  });

  it('opens the page where the connectors are listed', async () => {
    const onOpen = vi.fn();
    render(<ConnectorDock rows={ROWS} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
