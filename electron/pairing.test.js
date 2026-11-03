import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The rules live in a CommonJS module: the window's shell requires them.
const require = createRequire(import.meta.url);
const {
  SCHEME,
  BRIDGE_PORT,
  PAIRING_TTL_SECONDS,
  pairingScript,
  section,
  pairingCode,
  pairingFailure,
  tailnetName,
  servedUrl,
  servedBridge,
  bridgeAnswers,
  pairingLink,
  describePairing,
} = require('./pairing.js');

const script = pairingScript();

/** An answer from the host, the way the script writes it. */
function answer({ pair = '', tailscale = '', serve = '', health = '' } = {}) {
  return [
    '##PAIR',
    pair,
    '##TAILSCALE',
    tailscale,
    '##SERVE',
    serve,
    '##HEALTH',
    health,
  ].join('\n');
}

describe('the script', () => {
  it('asks for the code, the tailnet, the publication and the health', () => {
    expect(script).toContain('##PAIR');
    expect(script).toContain('##TAILSCALE');
    expect(script).toContain('##SERVE');
    expect(script).toContain('##HEALTH');
    expect(script).toContain('python3 -m hermes_bridge pair');
    expect(script).toContain(`127.0.0.1:${BRIDGE_PORT}`);
  });

  it('never fails the read for a missing tool', () => {
    expect(script.trim().endsWith('exit 0')).toBe(true);
  });
});

describe('one section of the answer', () => {
  it('is what sits between its sentinel and the next', () => {
    expect(section(answer({ pair: 'hello', serve: 'world' }), 'PAIR')).toBe(
      'hello',
    );
    expect(section(answer({ pair: 'hello', serve: 'world' }), 'SERVE')).toBe(
      'world',
    );
  });

  it('is empty when the section is not there', () => {
    expect(section('nothing', 'PAIR')).toBe('');
  });

  it('is empty when there was no answer at all', () => {
    expect(section(null, 'PAIR')).toBe('');
    expect(pairingCode(undefined)).toBe('');
  });
});

describe('the code', () => {
  it('is the one the bridge printed', () => {
    expect(pairingCode(answer({ pair: 'Pairing code: ABCD-EFGH' }))).toBe(
      'ABCD-EFGH',
    );
  });

  it('is read in capitals', () => {
    expect(pairingCode(answer({ pair: 'pairing code: abcd-efgh' }))).toBe(
      'ABCD-EFGH',
    );
  });

  it('is nothing when the bridge printed none', () => {
    expect(pairingCode(answer({ pair: 'Type it in the app' }))).toBe('');
  });
});

describe('a pairing that failed', () => {
  it('says when the bridge is not installed', () => {
    expect(
      pairingFailure(
        answer({ pair: "No module named 'hermes_bridge'" }),
        'the box',
      ),
    ).toEqual({
      error: 'The bridge is not installed on the box.',
      hint: 'Run bridge/deploy/install.sh there — it lays the package out in ~/hermes-bridge.',
    });
  });

  it('relays the first line the host wrote', () => {
    expect(pairingFailure(answer({ pair: 'Permission denied' }), 'the box')).toEqual({
      error: 'Permission denied',
      hint: 'The bridge must be running on the host, and Python must find its package.',
    });
  });

  it('has words of its own when the host wrote nothing', () => {
    expect(pairingFailure(answer(), 'the box').error).toBe(
      'The bridge on the box did not mint a code.',
    );
  });
});

describe('the tailnet', () => {
  it('is the name Tailscale writes, without its dot', () => {
    expect(
      tailnetName(answer({ tailscale: '{"Self":{"DNSName":"box.tail.ts.net."}}' })),
    ).toBe('box.tail.ts.net');
  });

  it('is read from the line when the answer is not JSON', () => {
    expect(
      tailnetName(answer({ tailscale: '{"Self": {"DNSName": "box.tail.ts.net."}' })),
    ).toBe('box.tail.ts.net');
  });

  it('is nothing when Tailscale said nothing', () => {
    expect(tailnetName(answer())).toBe('');
  });

  it('is nothing when the name is not a name', () => {
    expect(tailnetName(answer({ tailscale: '{"Self":{"DNSName":42}}' }))).toBe(
      '',
    );
  });
});

describe('the publication', () => {
  it('is the HTTPS address serve printed', () => {
    expect(
      servedUrl(answer({ serve: 'https://box.tail.ts.net\n|-- / proxy' })),
    ).toBe('https://box.tail.ts.net');
  });

  it('is not there when serve printed no address', () => {
    expect(servedUrl(answer({ serve: 'no serve config' }))).toBe('');
  });

  it('is the bridge only when the port is forwarded', () => {
    expect(
      servedBridge(
        answer({
          serve: `https://box.tail.ts.net\n|-- / proxy http://127.0.0.1:${BRIDGE_PORT}`,
        }),
      ),
    ).toBe(true);
    expect(
      servedBridge(answer({ serve: 'https://box.tail.ts.net\n|-- / proxy http://127.0.0.1:9000' })),
    ).toBe(false);
    expect(servedBridge(answer())).toBe(false);
  });
});

describe('the health', () => {
  it('is the service naming itself', () => {
    expect(
      bridgeAnswers(answer({ health: '{"service":"hermes-bridge","ok":true}' })),
    ).toBe(true);
  });

  it('is false when nothing answered', () => {
    expect(bridgeAnswers(answer())).toBe(false);
  });

  it('is false when the answer is not JSON', () => {
    expect(bridgeAnswers(answer({ health: 'not json' }))).toBe(false);
  });
});

describe('the link', () => {
  it('carries both halves, encoded', () => {
    expect(pairingLink('https://box.tail.ts.net', 'ABCD-EFGH')).toBe(
      `${SCHEME}://pair?url=https%3A%2F%2Fbox.tail.ts.net&code=ABCD-EFGH`,
    );
  });
});

describe('what the phone is handed', () => {
  const pair = 'Pairing code: ABCD-EFGH';
  const tailscale = '{"Self":{"DNSName":"box.tail.ts.net."}}';

  it('is the published address when Tailscale publishes it', () => {
    const result = describePairing(
      answer({
        pair,
        tailscale,
        serve: `https://box.tail.ts.net\n|-- / proxy http://127.0.0.1:${BRIDGE_PORT}`,
        health: '{"service":"hermes-bridge"}',
      }),
      'the box',
    );
    expect(result).toEqual({
      ok: true,
      code: 'ABCD-EFGH',
      url: 'https://box.tail.ts.net',
      link: `${SCHEME}://pair?url=https%3A%2F%2Fbox.tail.ts.net&code=ABCD-EFGH`,
      published: true,
      bridge: true,
      expiresIn: PAIRING_TTL_SECONDS,
    });
  });

  it('falls back on the tailnet name when serve says nothing', () => {
    const result = describePairing(answer({ pair, tailscale }), 'the box');
    expect(result.ok).toBe(true);
    expect(result.url).toBe('https://box.tail.ts.net');
    expect(result.published).toBe(false);
  });

  it('still refuses when the host has no tailnet name', () => {
    const result = describePairing(answer({ pair }), 'the box');
    expect(result).toEqual({
      ok: false,
      code: 'ABCD-EFGH',
      error: 'the box is not on a tailnet the phone can reach.',
      hint: 'Install Tailscale on the host and publish the bridge: sudo tailscale serve --bg --https=443 http://127.0.0.1:8765',
    });
  });

  it('is the failure when no code came out', () => {
    expect(describePairing(answer({ pair: 'Permission denied' }), 'the box')).toEqual({
      ok: false,
      error: 'Permission denied',
      hint: 'The bridge must be running on the host, and Python must find its package.',
    });
  });
});
