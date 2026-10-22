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

  /** The host starts the connection and answers with the link to open. */
  async function connect(row: Connector) {
    if (!bridge?.connectConnector) return;
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

  const statusWord = loading
    ? 'Reading the host…'
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
          {!loading ? (
            <button
              type="button"
              className="settings-page-action"
              onClick={retry}
            >
              Try again
            </button>
          ) : null}
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
            <button
              type="button"
              className="settings-action is-small"
              onClick={retry}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!failed && closed.length && rows.length === 0 && !loading ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Closed on this host</h3>
              <p>
                The services of Hermes live with the account, not on the
                machine. The host has to be signed in to Nous for them to open.
              </p>
            </div>
            <button
              type="button"
              className="settings-page-action"
              onClick={retry}
            >
              Try again
            </button>
          </header>
          <div className="settings-card-body">
            {closed.map((message) => (
              <p className="settings-hint" key={message}>
                {message}
              </p>
            ))}
            <p className="settings-hint">
              On the host, run <code>hermes auth add nous</code> and sign in.
              The services open by themselves after that, and the marks of the
              connected ones come back to the dock.
            </p>
          </div>
        </section>
      ) : null}

      {answer && answer.available && rows.length === 0 && !failed && !loading ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Nothing to connect</h3>
              <p>The host did not offer a single service.</p>
            </div>
          </header>
        </section>
      ) : null}

      {rows.length > 0 && closed.length > 0 && !failed ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Some lists stayed closed</h3>
              <p>
                The page shows what the host did open. The rest says why in the
                host's own words.
              </p>
            </div>
          </header>
          <div className="settings-card-body">
            {closed.map((message) => (
              <p className="settings-hint" key={message}>
                {message}
              </p>
            ))}
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
        </section>
      ) : null}
    </div>
  );
}
