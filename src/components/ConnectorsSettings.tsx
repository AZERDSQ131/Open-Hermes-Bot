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

  // The list is read once, when the page opens: it is the host's, not ours.
  useEffect(() => {
    const reader = bridge?.connectors;
    if (!reader) return;
    let cancelled = false;
    reader()
      .then((next: HermesConnectorList) => {
        if (cancelled) return;
        setAnswer(next);
        setError(next?.error ?? '');
      })
      .catch((reason: Error) => {
        if (cancelled) return;
        setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const rows = answer ? readConnectors(answer) : [];
  const connected = rows.filter((row) => row.state === 'connected');

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
          <span className="settings-card-meta">
            {answer
              ? connected.length
                ? `${connected.length} connected`
                : 'None connected'
              : 'Reading the host…'}
          </span>
        </div>
      </header>

      {error ? <p className="models-error">{error}</p> : null}
      {notice ? <p className="settings-hint">{notice}</p> : null}

      {answer && !answer.available ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Not on this host</h3>
              <p>
                {answer.message ||
                  'The connectors are not available on this host.'}
              </p>
            </div>
          </header>
        </section>
      ) : null}

      {answer && answer.available && rows.length === 0 ? (
        <section className="settings-card">
          <header className="settings-card-head">
            <div>
              <h3>Nothing to connect</h3>
              <p>The host did not offer a single service.</p>
            </div>
          </header>
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
