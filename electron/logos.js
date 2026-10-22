// The rules of the marks.
//
// The connectors of the host are drawn with the marks of their services,
// and the marks live on the vendor's own service. The window does not go
// and get them: the shell asks, and hands the bytes over, so the picture
// arrives the way a file does.
//
// The rules live here, in one file, so the shell and its tests cannot
// disagree about what may be asked for.

'use strict';

/** The service the marks of the connectors live on, and nothing else. */
const MARK_SERVICE = /^https:\/\/logos\.composio\.dev\/api\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Whether an address is one the shell will go to.
 *
 * Only the service of the vendor, and only for the mark of a named
 * service. The shell is not a door to the network for whoever asks, so
 * anything else is refused without a question.
 */
function isMarkAddress(url) {
  return MARK_SERVICE.test(String(url ?? '').trim());
}

/**
 * The reader of the marks.
 *
 * It asks the service once per address: the marks do not change while the
 * app is open, and the dock and the settings page want the same ones. A
 * mark that did not come is not remembered, so a network that was asleep
 * when the page opened does not cost the mark for good.
 *
 * The one that asks is given, so the rules can be tested without a network.
 */
function createMarkReader(ask) {
  const fetchImpl = ask || globalThis.fetch;
  const seen = new Map();

  return async function readMark(url) {
    const address = String(url ?? '').trim();
    if (!isMarkAddress(address)) return { ok: false, logo: '' };
    const known = seen.get(address);
    if (known) return known;

    const pending = Promise.resolve()
      .then(() => fetchImpl(address, { headers: { Accept: 'image/*' } }))
      .then(async (answer) => {
        const type = answer && answer.ok ? answer.headers.get('content-type') ?? '' : '';
        if (!type.startsWith('image/')) return { ok: false, logo: '' };
        const bytes = Buffer.from(await answer.arrayBuffer());
        return { ok: true, logo: `data:${type};base64,${bytes.toString('base64')}` };
      })
      .catch(() => ({ ok: false, logo: '' }));

    seen.set(address, pending);
    const mark = await pending;
    if (!mark.ok) seen.delete(address);
    return mark;
  };
}

module.exports = { MARK_SERVICE, isMarkAddress, createMarkReader };
