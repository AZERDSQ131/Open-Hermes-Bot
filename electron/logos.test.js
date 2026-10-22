import { describe, expect, it, vi } from 'vitest';
import { createMarkReader, isMarkAddress } from './logos.js';

const ADDRESS = 'https://logos.composio.dev/api/notion';

/** An answer that carries the bytes of a picture. */
function picture(type = 'image/png', bytes = '89504e47') {
  return {
    ok: true,
    headers: { get: () => type },
    arrayBuffer: async () => Uint8Array.from(Buffer.from(bytes, 'hex')).buffer,
  };
}

describe('the marks of the connectors', () => {
  it('asks the service of the vendor, and nothing else', () => {
    expect(isMarkAddress(ADDRESS)).toBe(true);
    expect(isMarkAddress('https://logos.composio.dev/api/google_maps')).toBe(true);
    expect(isMarkAddress('http://logos.composio.dev/api/notion')).toBe(false);
    expect(isMarkAddress('https://elsewhere.example/api/notion')).toBe(false);
    expect(isMarkAddress('https://logos.composio.dev/api/../secret')).toBe(false);
    expect(isMarkAddress('')).toBe(false);
    expect(isMarkAddress(undefined)).toBe(false);
  });

  it('hands the picture over as bytes the page may draw', async () => {
    const ask = vi.fn(async () => picture());
    const read = createMarkReader(ask);
    const mark = await read(ADDRESS);
    expect(mark.ok).toBe(true);
    expect(mark.logo).toBe('data:image/png;base64,iVBORw==');
    expect(ask).toHaveBeenCalledWith(ADDRESS, { headers: { Accept: 'image/*' } });
  });

  it('refuses an address that is not the service of the vendor', async () => {
    const ask = vi.fn(async () => picture());
    const read = createMarkReader(ask);
    expect(await read('https://elsewhere.example/api/notion')).toEqual({
      ok: false,
      logo: '',
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks once for the same address', async () => {
    const ask = vi.fn(async () => picture());
    const read = createMarkReader(ask);
    await read(ADDRESS);
    await read(ADDRESS);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('does not keep a mark that did not come', async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, headers: { get: () => '' } })
      .mockResolvedValueOnce(picture());
    const read = createMarkReader(ask);
    expect((await read(ADDRESS)).ok).toBe(false);
    expect((await read(ADDRESS)).ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('says no when the service does not answer', async () => {
    const read = createMarkReader(async () => {
      throw new Error('the network is asleep');
    });
    expect(await read(ADDRESS)).toEqual({ ok: false, logo: '' });
  });

  it('says no when the answer is not a picture', async () => {
    const read = createMarkReader(async () => picture('text/html'));
    expect(await read(ADDRESS)).toEqual({ ok: false, logo: '' });
  });

  it('says no when the service answers that it has no such mark', async () => {
    const read = createMarkReader(async () => ({
      ok: false,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    expect(await read(ADDRESS)).toEqual({ ok: false, logo: '' });
  });

  it('says no when the answer says nothing about the picture', async () => {
    const read = createMarkReader(async () => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    expect(await read(ADDRESS)).toEqual({ ok: false, logo: '' });
  });

  it('says no when the answer is nothing at all', async () => {
    const read = createMarkReader(async () => undefined);
    expect(await read(ADDRESS)).toEqual({ ok: false, logo: '' });
  });

  it('asks the network itself when it is given no one to ask', async () => {
    const ask = vi.fn(async () => picture());
    vi.stubGlobal('fetch', ask);
    const read = createMarkReader();
    expect((await read(ADDRESS)).ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('says no when there is no address at all', async () => {
    const ask = vi.fn(async () => picture());
    const read = createMarkReader(ask);
    expect(await read(undefined)).toEqual({ ok: false, logo: '' });
    expect(ask).not.toHaveBeenCalled();
  });
});
