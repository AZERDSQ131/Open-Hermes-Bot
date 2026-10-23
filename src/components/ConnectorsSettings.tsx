import { useEffect, useState } from 'react';
import type { HermesConnectorList } from '../hermes';
import { readConnectors, type Connector } from '../connectors';
import { ConnectorMark } from './ConnectorMark';

/** Where a connector stands, in one word. */
const STATE_WORD: Record<Connector['state'], string> = {
  connected: 'Connected',
  available: 'Not connected',
  broken: 'Needs attention',
  off: 'Turned off',
  unknown: 'Unknown',
};

/**
 * How long the page says it is reading before it stops.
 *
 * The read is a shell on the host, and a shell can be stuck: a link that
 * died, a machine asleep, a process that never comes back. The page has to
 * stop saying the same thing forever — past this, it says it took too long
 * and offers to ask again. It sits above the shell's own timeout, so the
 * host's reason is the one shown when the host has one.
 */
const READING_DEADLINE_MS = 70000;

/** How long a person has to approve a service in their own browser. */
const APPROVAL_WINDOW_MS = 320000;

/**
 * The connectors: the services a bot can reach besides Hermes itself.
 *
 * They live on the host, behind the managed gateway. The app asks the host
 * for them and draws what it finds: it keeps nothing of its own.
 */
export function ConnectorsSettings() {
  const bridge = window.hermes;
  const [answer, setAnswer] = useState<HermesConnectorList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  // Every ask is a token, and the retry asks past the answer the shell keeps:
  // after a service was connected, the list read a minute ago is a lie.
  const [reload, setReload] = useState({ token: 0, fresh: false });
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  // The list is read when the page opens, and again when asked: it is the
  // host's, not ours. A failed read stays readable: the page says what the
  // host said, and offers to ask again.
  useEffect(() => {
    const reader = bridge?.connectors;
    if (!reader) {
      setLoading(false);
      setError('The connectors are only available inside the desktop app.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setTimedOut(false);
    // A shell can hang, and nothing says the answer will ever come: the page
    // does not say "Reading the host…" forever.
    const deadline = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setTimedOut(true);
      setError('The host took too long to answer.');
    }, READING_DEADLINE_MS);
    reader({ fresh: reload.fresh })
      .then((next: HermesConnectorList) => {
        if (cancelled) return;
        setAnswer(next);
        setError(next?.error ?? '');
      })
      .catch((reason: Error) => {
        if (cancelled) return;
        setError(
          reason instanceof Error ? reason.message : 'The host did not answer.',
        );
      })
      .finally(() => {
        window.clearTimeout(deadline);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
    };
  }, [bridge, reload]);

  const rows = answer ? readConnectors(answer) : [];
  const connected = rows.filter((row) => row.state === 'connected');
  // The services the portal holds: the only ones a Nous account unlocks. The
  // ones the host connects by itself are not on that list, so an empty
  // portal never turns into a wall in front of them.
  const managed = rows.filter((row) => !row.mcp);
  // Why the host could not answer, in its own words.
  const closed = answer?.messages ?? [];
  const failed = Boolean(answer) && !answer?.ok;
  // No Nous account on the host, and portal services on offer: signing in
  // stays a choice at the moment of connecting those — never a wall before
  // the ones that never needed it. A host with no catalogue at all still
  // asks for the account: it is the only way to get a service there.
  const portalNeeded = rows.length === 0 || managed.length > 0;
  const needsAuth =
    Boolean(answer) &&
    !failed &&
    !loading &&
    closed.length > 0 &&
    portalNeeded &&
    (answer?.accounts?.length ?? 0) === 0 &&
    connected.length === 0;
  const empty =
    Boolean(answer) &&
    Boolean(answer?.available) &&
    !failed &&
    !loading &&
    rows.length === 0 &&
    closed.length === 0;

  /** The host starts the connection and answers with the link to open. */
  async function connect(row: Connector) {
    if (row.mcp) return connectLocal(row);
    if (!bridge?.connectConnector) return;
    // No account on the host yet: sign in first, with the same code flow,
    // then carry on minting the service link — one click either way.
    if (needsAuth && !loginBusy) {
      const signedIn = await signInWithNous();
      if (!signedIn) return;
    }
    setBusy(row.slug);
    setNotice('');
    setError('');
    try {
      const result = await bridge.connectConnector({ slug: row.slug });
      if (!result.ok) {
        setError(result.error ?? 'The connection could not be started.');
        return;
      }
      const url = result.url ?? '';
      if (!url) {
        setNotice(`${row.name} is waiting for the page to open.`);
        return;
      }
      const opened = await bridge.openLink?.(url);
      setNotice(
        opened?.ok
          ? `${row.name} is waiting for you in the browser.`
          : `${row.name} could not be opened in the browser.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The connection could not be started.',
      );
    } finally {
      setBusy('');
    }
  }

  /**
   * A service the host connects by itself: installed there, then the
   * provider runs its own browser flow. No Nous account is asked for.
   *
   * The approval happens in the browser, so the page waits: it asks where
   * the flow stands until it is done, the person cancels, or the window for
   * approving is gone.
   */
  async function connectLocal(row: Connector) {
    if (!bridge?.mcpConnect || !bridge?.mcpConnectStatus) {
      setError('Connecting a service needs the desktop app.');
      return;
    }
    setBusy(row.slug);
    setNotice('');
    setError('');
    try {
      const started = await bridge.mcpConnect({
        name: row.slug,
        installed: row.installed,
      });
      if (!started.ok) {
        setError(started.error ?? 'The connection could not be started.');
        return;
      }
      setNotice(
        started.url
          ? `${row.name} is waiting for you in the browser.`
          : `${row.name} is being installed on the host.`,
      );
      const deadline = Date.now() + APPROVAL_WINDOW_MS;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const state = await bridge.mcpConnectStatus({ name: row.slug });
        if (state.done) {
          if (!state.ok) {
            setError(state.error ?? 'The authorization did not complete.');
            return;
          }
          // The read comes after the word, so the page says what happened
          // while it asks the host again.
          retry();
          setNotice(`${row.name} is connected.`);
          return;
        }
        if (Date.now() > deadline) {
          setError('The approval did not come. Try again when you are ready.');
          return;
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The connection could not be started.',
      );
    } finally {
      setBusy('');
    }
  }

  function retry() {
    setNotice('');
    setError('');
    setTimedOut(false);
    setReload((next) => ({ token: next.token + 1, fresh: true }));
  }

  const [loginUrl, setLoginUrl] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  /** Sign in with Nous without the terminal: the page opens, approval lands. */
  async function signInWithNous(): Promise<boolean> {
    if (!bridge?.nousLoginStart || !bridge?.nousLoginPoll) {
      setError('Sign-in needs the desktop app.');
      return false;
    }
    setLoginBusy(true);
    setError('');
    setNotice('');
    let deviceCode = '';
    let intervalMs = 5000;
    try {
      const start = await bridge.nousLoginStart();
      if (!start.ok) {
        setError(start.error ?? 'The sign-in could not start.');
        return false;
      }
      deviceCode = String(start.device_code ?? '');
      intervalMs = Math.max(
        2000,
        Math.min(10000, Number(start.interval ?? 5) * 1000),
      );
      setLoginUrl(String(start.url ?? ''));
      setLoginCode(String(start.user_code ?? ''));
      if (start.url) await bridge.openLink?.(start.url);
      setNotice('Approve the sign-in in the browser, then come back.');
      const deadline = Date.now() + Number(start.expires_in ?? 600) * 1000;
      for (;;) {
        if (Date.now() > deadline) {
          setError('The sign-in expired. Start again.');
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        const poll = await bridge.nousLoginPoll({ device_code: deviceCode });
        if (poll.ok) {
          setLoginUrl('');
          setLoginCode('');
          setNotice('Signed in. Reading the services…');
          retry();
          return true;
        }
        if (!poll.pending) {
          setError(poll.error ?? 'The sign-in failed.');
          return false;
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The sign-in failed.',
      );
      return false;
    } finally {
      setLoginBusy(false);
    }
  }

  const statusWord = loading
    ? 'Reading the host…'
    : failed || timedOut
      ? 'Host down'
      : needsAuth
        ? 'Sign-in to connect'
        : connected.length
          ? `${connected.length} connected`
          : 'None connected';

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Connectors</h2>
          <p>
            The services your bots can reach besides Hermes. They live on the
            host, and they are connected from there.
          </p>
        </div>
        <div className="settings-page-side">
          <span className="settings-card-meta">{statusWord}</span>
        </div>
      </header>

      {error ? <p className="models-error">{error}</p> : null}
      {notice ? <p className="settings-hint">{notice}</p> : null}

      {loading && !answer ? (
        <div className="connectors-loading" role="status">
          <span className="connectors-spinner" aria-hidden="true" />
          <p className="connectors-loading-word">Reading the host…</p>
        </div>
      ) : null}

      {(failed || timedOut) && !loading ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>The host did not answer</h3>
              <p>
                The connection to Hermes is up, but the question about the
                services never came back.
              </p>
            </div>
          </header>
          <div className="settings-card-body">
            <p className="settings-hint">
              Check that Hermes is still running on the host, then try again.
            </p>
            <div className="connectors-actions">
              <button
                type="button"
                className="settings-action is-small"
                onClick={retry}
              >
                Try again
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {needsAuth ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Sign in to connect</h3>
              <p>
                Browse freely — one approval when you connect your first
                service, then everything opens.
              </p>
            </div>
          </header>
          <div className="settings-card-body">
            {loginCode ? (
              <>
                <p className="connectors-code" aria-live="polite">
                  {loginCode}
                </p>
                <p className="settings-hint">
                  Approve it in the browser, then come back. This page keeps
                  waiting.
                </p>
              </>
            ) : null}
            <div className="connectors-actions">
              <button
                type="button"
                className="settings-action is-small"
                disabled={loginBusy}
                onClick={() => void signInWithNous()}
              >
                {loginBusy
                  ? loginUrl
                    ? 'Waiting for approval…'
                    : 'Opening…'
                  : error
                    ? 'Start again'
                    : 'Sign in with Nous'}
              </button>
              {loginUrl && loginBusy ? (
                <button
                  type="button"
                  className="settings-text-button"
                  onClick={() => void bridge?.openLink?.(loginUrl)}
                >
                  Open the browser again
                </button>
              ) : null}
            </div>
            {closed.length ? (
              <details className="settings-details">
                <summary>Why am I seeing this?</summary>
                {closed.map((message) => (
                  <p className="settings-hint" key={message}>
                    {message}
                  </p>
                ))}
              </details>
            ) : null}
          </div>
        </section>
      ) : null}

      {empty ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Nothing to connect</h3>
              <p>The host did not offer a single service.</p>
            </div>
          </header>
          <div className="settings-card-body">
            <div className="connectors-actions">
              <button
                type="button"
                className="settings-text-button"
                onClick={retry}
              >
                Refresh
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>The services</h3>
              <p>{rows.length} on offer.</p>
            </div>
            <button
              type="button"
              className="settings-text-button"
              onClick={retry}
            >
              Refresh
            </button>
          </header>
          <div className="capability-list">
            {rows.map((row) => (
              <div className="capability-row" key={row.slug}>
                <ConnectorMark row={row} className="capability-mark" />
                <span className="capability-copy">
                  <span className="capability-name">{row.name}</span>
                  {row.description ? (
                    <span className="capability-description">
                      {row.description}
                    </span>
                  ) : null}
                </span>
                <span className={`capability-state is-${row.state}`}>
                  {STATE_WORD[row.state]}
                </span>
                {row.state === 'connected' ? null : row.mcp &&
                  busy === row.slug ? (
                  <button
                    type="button"
                    className="settings-text-button"
                    onClick={() =>
                      void bridge?.mcpConnectCancel?.({ name: row.slug })
                    }
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="settings-action is-small"
                    disabled={busy === row.slug || !row.enabled}
                    onClick={() => void connect(row)}
                  >
                    {busy === row.slug ? 'Opening…' : 'Connect'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {closed.length > 0 && !failed ? (
            <div className="settings-card-body">
              <details className="settings-details">
                <summary>Some details from the host</summary>
                {closed.map((message) => (
                  <p className="settings-hint" key={message}>
                    {message}
                  </p>
                ))}
              </details>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
