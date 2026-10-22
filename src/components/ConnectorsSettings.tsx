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
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);

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
    reader()
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, reloadToken]);

  const rows = answer ? readConnectors(answer) : [];
  const connected = rows.filter((row) => row.state === 'connected');
  // Why the host could not answer, in its own words.
  const closed = answer?.messages ?? [];
  const failed = Boolean(answer) && !answer?.ok;
  // No Nous account on the host: nothing is connected and the host says why.
  // The list still stands on the local catalogue, so signing in stays a
  // choice at the moment of connecting — never a wall before it.
  const needsAuth =
    Boolean(answer) &&
    !failed &&
    !loading &&
    closed.length > 0 &&
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

  function retry() {
    setNotice('');
    setError('');
    setReloadToken((token) => token + 1);
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
    : failed
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

      {failed && !loading ? (
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
                {row.state === 'connected' ? null : (
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
