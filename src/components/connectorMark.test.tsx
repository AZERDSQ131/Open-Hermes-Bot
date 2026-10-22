import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConnectorMark } from './ConnectorMark';
import type { Connector } from '../connectors';

const ROW: Connector = {
  slug: 'notion',
  name: 'Notion',
  description: 'Your pages',
  category: 'Documents',
  logo: 'https://logos.composio.dev/api/notion',
  state: 'connected',
  enabled: true,
  account: '',
};

const MARK = 'data:image/png;base64,iVBORw==';

describe('the mark of a connector', () => {
  it('draws the bytes the shell handed over', async () => {
    (window as unknown as { hermes: unknown }).hermes = {
      connectorLogo: vi.fn(async () => ({ ok: true, logo: MARK })),
    };
    const { container } = render(<ConnectorMark row={ROW} className="dock-mark" />);
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe(MARK);
    });
    expect(screen.queryByText('N')).toBeNull();
  });

  it('stands in with the first letter when there is no shell to ask', () => {
    render(<ConnectorMark row={ROW} className="dock-mark" />);
    expect(screen.getByText('N')).toBeTruthy();
    expect(screen.getByText('N').className).toContain('is-letter');
  });

  it('stands in with the first letter when there is no mark to ask for', () => {
    (window as unknown as { hermes: unknown }).hermes = {
      connectorLogo: vi.fn(async () => ({ ok: true, logo: MARK })),
    };
    render(
      <ConnectorMark row={{ ...ROW, logo: '' }} className="dock-mark" />,
    );
    expect(screen.getByText('N')).toBeTruthy();
  });

  it('stands in with the first letter when the shell says no', async () => {
    (window as unknown as { hermes: unknown }).hermes = {
      connectorLogo: vi.fn(async () => ({ ok: false, logo: '' })),
    };
    render(<ConnectorMark row={ROW} className="dock-mark" />);
    await waitFor(() => {
      expect(screen.getByText('N')).toBeTruthy();
    });
  });

  it('forgets the answer when the mark is gone before it comes', async () => {
    (window as unknown as { hermes: unknown }).hermes = {
      connectorLogo: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true, logo: MARK };
      }),
    };
    const { unmount } = render(
      <ConnectorMark row={ROW} className="dock-mark" />,
    );
    unmount();
    // Nothing is left of the mark, and nothing was drawn after it left.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(document.querySelector('img')).toBeNull();
  });
});
