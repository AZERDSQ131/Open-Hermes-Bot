import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhonePairing } from './PhonePairing';

function withBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    pairingCode: vi.fn(async () => ({
      ok: true,
      code: 'ABCD-EFGH',
      url: 'https://box.tail.ts.net',
      link: 'hermesbot://pair?url=https%3A%2F%2Fbox.tail.ts.net&code=ABCD-EFGH',
      qr: 'data:image/png;base64,aaaa',
      label: 'my-host',
      published: true,
      bridge: true,
      expiresIn: 1200,
    })),
    copyText: vi.fn(async () => undefined),
    ...overrides,
  };
  (window as unknown as { hermes: unknown }).hermes = bridge;
  return bridge;
}

describe('the phone page', () => {
  it('mints a code on the host and draws it', async () => {
    const bridge = withBridge();
    render(<PhonePairing />);

    await userEvent.click(screen.getByRole('button', { name: 'Mint a code' }));

    await waitFor(() => expect(bridge.pairingCode).toHaveBeenCalled());
    expect(await screen.findByText('ABCD-EFGH')).toBeTruthy();
    expect(screen.getByAltText('Pairing code ABCD-EFGH')).toBeTruthy();
    expect(screen.getByText('https://box.tail.ts.net')).toBeTruthy();
    expect(screen.getByText(/twenty minutes/)).toBeTruthy();
  });

  it('copies the link the phone reads', async () => {
    const bridge = withBridge();
    render(<PhonePairing />);

    await userEvent.click(screen.getByRole('button', { name: 'Mint a code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copy the link' }));

    expect(bridge.copyText).toHaveBeenCalledWith(
      'hermesbot://pair?url=https%3A%2F%2Fbox.tail.ts.net&code=ABCD-EFGH',
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('says what to do when the host has no bridge', async () => {
    withBridge({
      pairingCode: vi.fn(async () => ({
        ok: false,
        error: 'The bridge is not installed on my-host.',
        hint: 'Run bridge/deploy/install.sh there.',
      })),
    });
    render(<PhonePairing />);

    await userEvent.click(screen.getByRole('button', { name: 'Mint a code' }));

    expect(
      await screen.findByText('The bridge is not installed on my-host.'),
    ).toBeTruthy();
    expect(screen.getByText('Run bridge/deploy/install.sh there.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('warns when Tailscale does not publish or answer', async () => {
    withBridge({
      pairingCode: vi.fn(async () => ({
        ok: true,
        code: 'ABCD-EFGH',
        url: 'https://box.tail.ts.net',
        qr: '',
        label: 'my-host',
        published: false,
        bridge: false,
        expiresIn: 1200,
      })),
    });
    render(<PhonePairing />);

    await userEvent.click(screen.getByRole('button', { name: 'Mint a code' }));

    expect(await screen.findByText(/not publishing the bridge yet/)).toBeTruthy();
    expect(screen.getByText(/not answering on/)).toBeTruthy();
  });

  it('relays what answered instead of a picture', async () => {
    withBridge({
      pairingCode: vi.fn(async () => {
        throw new Error('my-host did not answer.');
      }),
    });
    render(<PhonePairing />);

    await userEvent.click(screen.getByRole('button', { name: 'Mint a code' }));

    expect(await screen.findByText('my-host did not answer.')).toBeTruthy();
  });
});
