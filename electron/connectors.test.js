import { describe, expect, it, vi } from 'vitest';
import { CONNECTORS_TTL_MS, createConnectorsReader } from './connectors.js';

const ANSWER = { ok: true, catalog: [{ slug: 'notion' }], messages: [] };

/** A clock the test moves by hand. */
function clock(start = 1000) {
  let at = start;
  return {
    now: () => at,
    move: (ms) => {
      at += ms;
    },
  };
}

describe('the read of the connectors', () => {
  it('asks the host once for everyone who is waiting', async () => {
    const read = vi.fn(async () => ANSWER);
    const readers = createConnectorsReader(read);
    const [first, second, third] = await Promise.all([
      readers(),
      readers(),
      readers(),
    ]);
    expect(third).toBe(ANSWER);
    expect(first).toBe(second);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('hands back an answer that just came, without asking again', async () => {
    const read = vi.fn(async () => ANSWER);
    const readers = createConnectorsReader(read);
    await readers();
    await readers();
    await readers();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('asks again once the answer is old', async () => {
    const time = clock();
    const read = vi.fn(async () => ANSWER);
    const readers = createConnectorsReader(read, { now: time.now });
    await readers();
    time.move(CONNECTORS_TTL_MS + 1);
    await readers();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps a failure out of the shelf: asking again is the point', async () => {
    const read = vi.fn(async () => ({ ok: false, error: 'boom' }));
    const readers = createConnectorsReader(read);
    await readers();
    await readers();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('asks past the answer that is kept when the page wants the truth', async () => {
    const time = clock();
    const read = vi.fn(async () => ANSWER);
    const readers = createConnectorsReader(read, { now: time.now });
    await readers();
    await readers({ fresh: true });
    expect(read).toHaveBeenCalledTimes(2);
    // The fresh answer is the one that is kept from then on.
    await readers();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('shares a read that is already out, even when asked fresh', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const read = vi.fn(() => gate);
    const readers = createConnectorsReader(read);
    const first = readers();
    const fresh = readers({ fresh: true });
    release(ANSWER);
    expect(await first).toBe(ANSWER);
    expect(await fresh).toBe(ANSWER);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('gives the known answer when the read blows up', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(ANSWER)
      .mockRejectedValueOnce(new Error('the shell died'));
    const readers = createConnectorsReader(read, { ttlMs: 0 });
    await readers();
    expect(await readers()).toBe(ANSWER);
  });

  it('says nothing but throws when it never read anything', async () => {
    const readers = createConnectorsReader(async () => {
      throw new Error('the shell died');
    });
    await expect(readers()).rejects.toThrow('the shell died');
  });

  it('lets the next read start after one blew up', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('the shell died'))
      .mockResolvedValueOnce(ANSWER);
    const readers = createConnectorsReader(read);
    await expect(readers()).rejects.toThrow('the shell died');
    expect(await readers()).toBe(ANSWER);
  });
});
