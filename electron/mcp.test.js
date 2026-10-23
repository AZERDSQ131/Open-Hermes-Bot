import { describe, expect, it } from 'vitest';
import { authUrlIn, callbackPort, loginOutcome } from './mcp.js';

const AUTHORIZE =
  'https://mcp.notion.com/authorize?response_type=code&client_id=abc' +
  '&redirect_uri=http%3A%2F%2F127.0.0.1%3A27890%2Fcallback&state=xyz' +
  '&code_challenge=abc&code_challenge_method=S256';

describe('the link a host prints', () => {
  it('keeps the authorization link, not the links around it', () => {
    const printed = [
      '  Starting OAuth flow for \'notion\'...',
      '  See: https://hermes-agent.nousresearch.com/docs/guides/oauth-over-ssh',
      '  Open this URL in your browser:',
      `    ${AUTHORIZE}`,
      '  which only the listener on THIS machine can receive.',
    ].join('\n');
    expect(authUrlIn(printed)).toBe(AUTHORIZE);
  });

  it('says nothing when the output carries no authorization link', () => {
    expect(authUrlIn('Installing MCP notion\n✓ Installed')).toBe('');
    expect(authUrlIn('')).toBe('');
    expect(authUrlIn(undefined)).toBe('');
  });

  it('ignores a plain https link that names no callback', () => {
    expect(
      authUrlIn('see https://example.com/docs and https://example.com/tos'),
    ).toBe('');
  });
});

describe('the port the provider comes back to', () => {
  it('reads the port out of an encoded redirect', () => {
    expect(callbackPort(AUTHORIZE)).toBe(27890);
  });

  it('reads the port out of a redirect that is not encoded', () => {
    expect(
      callbackPort(
        'https://mcp.example.com/authorize?redirect_uri=http://127.0.0.1:27891/callback',
      ),
    ).toBe(27891);
    expect(
      callbackPort(
        'https://mcp.example.com/authorize?redirect_uri=http://localhost:27892/callback',
      ),
    ).toBe(27892);
    expect(
      callbackPort(
        'https://mcp.example.com/authorize?redirect_uri=http://[::1]:27893/callback',
      ),
    ).toBe(27893);
  });

  it('says zero when the link says nothing it can use', () => {
    expect(callbackPort('https://mcp.example.com/authorize?state=x')).toBe(0);
    expect(
      callbackPort(
        'https://mcp.example.com/authorize?redirect_uri=https://elsewhere.example/callback',
      ),
    ).toBe(0);
    expect(callbackPort('')).toBe(0);
    expect(callbackPort(undefined)).toBe(0);
  });

  it('still reads a link that cannot be decoded', () => {
    // The `%` is alone: the URL is not valid percent-encoding, and the raw
    // form is the one that has to be read.
    expect(
      callbackPort(
        'https://mcp.example.com/authorize?x=%&redirect_uri=http://127.0.0.1:27894/callback',
      ),
    ).toBe(27894);
  });
});

describe('what the host said about the login', () => {
  it('reads a token that landed', () => {
    expect(
      loginOutcome('  Starting OAuth flow for \'notion\'...\n\n  ✓ Authenticated — 12 tool(s) available\n'),
    ).toEqual({ ok: true, error: '' });
  });

  it('keeps the refusal the provider gave', () => {
    expect(
      loginOutcome(
        '  Starting OAuth flow for \'notion\'...\n  ✗ Authentication failed: Server does not advertise device authorization\n',
      ),
    ).toEqual({
      ok: false,
      error: 'Authentication failed: Server does not advertise device authorization',
    });
  });

  it('says something even when the host said nothing', () => {
    expect(loginOutcome('')).toEqual({
      ok: false,
      error: 'The authorization did not complete.',
    });
    expect(loginOutcome(undefined)).toEqual({
      ok: false,
      error: 'The authorization did not complete.',
    });
  });

  it('prefers the last failure when several were printed', () => {
    expect(
      loginOutcome('Error: first\n✗ second refusal\n'),
    ).toEqual({ ok: false, error: 'second refusal' });
  });
});
