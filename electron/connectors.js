// The rules of the read of the connectors.
//
// The list is not on the API: it is read on the machine that runs Hermes, by
// booting Python there and asking the tools. That read is the heaviest thing
// the app asks of the host, and it used to be asked once per page that
// wanted it — the dock at launch, the page when it opened, twice more while
// React settles. Three at once outlasted the timeout, and the page sat on
// "Reading the host…" while the host was asked the same question again and
// again.
//
// So the read is asked once: whoever asks while it is out waits for the same
// answer, and an answer that came a moment ago is given again without waking
// the host. The rule lives here, apart from the shell, so it is covered to
// the line.

'use strict';

/** How long an answer is given again without asking the host. */
const CONNECTORS_TTL_MS = 15000;

/**
 * One read at a time, and a fresh answer handed back again.
 *
 * A read that says it failed is not kept: asking again is how a person says
 * the host may be back. A read that throws when an answer is already known
 * gives that answer back instead — a list read a minute ago is worth more
 * than a page that says nothing.
 *
 * `fresh` skips the answer that is kept, without starting a second read: the
 * page uses it after a service was connected, when the old list is a lie.
 */
function createConnectorsReader(read, options = {}) {
  const ttlMs = options.ttlMs ?? CONNECTORS_TTL_MS;
  const now = options.now ?? Date.now;
  let kept = null;
  let pending = null;

  return function readConnectors({ fresh = false } = {}) {
    if (!fresh && kept && now() - kept.at < ttlMs) {
      return Promise.resolve(kept.answer);
    }
    if (pending) return pending;

    pending = Promise.resolve()
      .then(read)
      .then(
        (answer) => {
          if (answer && answer.ok) kept = { at: now(), answer };
          return answer;
        },
        (reason) => {
          if (kept) return kept.answer;
          throw reason;
        },
      )
      .finally(() => {
        pending = null;
      });

    return pending;
  };
}

module.exports = { CONNECTORS_TTL_MS, createConnectorsReader };
