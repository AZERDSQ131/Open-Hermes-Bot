import { useEffect, useState } from 'react';
import type { HermesSettings, HermesStatus } from '../hermes';
import { ChevronLeftIcon } from './Icons';
import { ModelsSettings } from './ModelsSettings';
import { UpdatesSettings } from './UpdatesSettings';

type Section = 'connection' | 'models' | 'updates' | 'setup';

type SettingsViewProps = {
  status: HermesStatus;
  onClose: () => void;
  onStatusChange: (status: HermesStatus) => void;
  /** Opens the guided setup again, from the beginning. */
  onRunSetup: () => void;
};

type BusyAction =
  | 'test'
  | 'save'
  | 'import'
  | 'disconnect'
  | 'connect'
  | 'clear'
  | null;

const STATE_LABEL: Record<HermesStatus['state'], string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Connection failed',
};

function fingerprint(host: string, port: string, apiKey: string) {
  return `${host.trim()}\u0000${port.trim()}\u0000${apiKey.trim()}`;
}

export function SettingsView({
  status,
  onClose,
  onStatusChange,
  onRunSetup,
}: SettingsViewProps) {
  const bridge = window.hermes;
  // No host is a name: the machine running Hermes is the person's to say.
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8642');
  const [localPort, setLocalPort] = useState('18742');
  const [autoConnect, setAutoConnect] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [section, setSection] = useState<Section>('connection');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [tested, setTested] = useState<{
    fingerprint: string;
    status: HermesStatus;
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    bridge
      ?.getSettings()
      .then((settings: HermesSettings) => {
        if (cancelled) return;
        setHost(settings.sshHost);
        setPort(String(settings.apiPort));
        setLocalPort(String(settings.localPort));
        setAutoConnect(settings.autoConnect);
        setHasKey(settings.hasKey);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const draftFingerprint = fingerprint(host, port, apiKey);
  const testStatus =
    tested && tested.fingerprint === draftFingerprint ? tested.status : null;
  const tunnelUrl = `127.0.0.1:${localPort || '18742'}`;
  const tunnelCommand = `ssh -N -L 127.0.0.1:${localPort || '18742'}:127.0.0.1:${
    port || '8642'
  } ${host || '<host>'}`;

  const feedback = error
    ? { tone: 'error' as const, text: error }
    : testStatus
      ? testStatus.state === 'connected'
        ? {
            tone: 'ok' as const,
            text: `Reachable · Hermes ${testStatus.version ?? '?'} · gateway ${
              testStatus.gateway ?? '?'
            }`,
          }
        : {
            tone: 'error' as const,
            text: testStatus.message ?? 'Could not reach the server',
          }
      : notice
        ? { tone: 'ok' as const, text: notice }
        : status.state === 'error' && status.message
          ? { tone: 'error' as const, text: status.message }
          : null;

  const disabled = Boolean(busy) || !bridge;
  const canTest =
    !disabled && host.trim() !== '' && (hasKey || apiKey.trim() !== '');

  function report(next: HermesStatus) {
    onStatusChange(next);
    setTested(null);
  }

  function start(action: BusyAction) {
    setBusy(action);
    setError('');
    setNotice('');
  }

  async function handleTest() {
    if (!bridge) return;
    start('test');
    const snapshot = draftFingerprint;
    const result = await bridge
      .test({
        sshHost: host,
        apiPort: Number.parseInt(port, 10),
        apiKey: apiKey.trim() || undefined,
      })
      .catch((reason: Error) => ({
        state: 'error' as const,
        message: reason.message,
      }));
    setTested({ fingerprint: snapshot, status: result });
    setBusy(null);
  }

  async function handleSave() {
    if (!bridge) return;
    start('save');
    const saved = await bridge
      .saveSettings({
        sshHost: host,
        apiPort: Number.parseInt(port, 10),
        localPort: Number.parseInt(localPort, 10),
        autoConnect,
        apiKey: apiKey.trim() || undefined,
      })
      .catch((reason: Error) => ({
        ok: false,
        error: reason.message,
        settings: undefined,
      }));
    if (!saved.ok) {
      setError(saved.error ?? 'Could not save the connection');
      setBusy(null);
      return;
    }
    if (saved.settings) {
      setHasKey(saved.settings.hasKey);
      setHost(saved.settings.sshHost);
      setPort(String(saved.settings.apiPort));
      setLocalPort(String(saved.settings.localPort));
      setAutoConnect(saved.settings.autoConnect);
    }
    setApiKey('');
    report(await bridge.connect());
    setBusy(null);
  }

  async function handleImportKey() {
    if (!bridge) return;
    start('import');
    const result = await bridge
      .importKey({ sshHost: host })
      .catch((reason: Error) => ({ ok: false, error: reason.message }));
    if (result.ok) {
      setHasKey(true);
      setApiKey('');
      setNotice(`Key imported from ${host || 'the server'}.`);
    } else {
      setError(result.error ?? 'Could not read the key from the server');
    }
    setBusy(null);
  }

  async function handleDisconnect() {
    if (!bridge) return;
    start('disconnect');
    report(await bridge.disconnect());
    setBusy(null);
  }

  // The way back: a person who asked to stay offline can ask again.
  async function handleConnect() {
    if (!bridge) return;
    start('connect');
    report(await bridge.connect());
    setBusy(null);
  }

  async function handleClearKey() {
    if (!bridge) return;
    start('clear');
    const saved = await bridge
      .saveSettings({
        sshHost: host,
        apiPort: Number.parseInt(port, 10),
        localPort: Number.parseInt(localPort, 10),
        autoConnect,
        clearKey: true,
      })
      .catch((reason: Error) => ({ ok: false, error: reason.message }));
    setApiKey('');
    if (saved.ok) {
      setHasKey(false);
      setNotice('Stored key removed from the Keychain.');
    } else {
      setError(saved.error ?? 'Could not remove the key');
    }
    setBusy(null);
  }

  return (
    <div
      className="settings-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <aside className="settings-rail">
        <button
          type="button"
          className="settings-back"
          onClick={onClose}
          aria-label="Back to Hermes Bot"
          title="Back  Esc"
        >
          <ChevronLeftIcon size={17} />
        </button>

        <h1 id="settings-title" className="settings-rail-title">
          Settings
        </h1>

        <nav className="settings-nav" aria-label="Settings sections">
          <span className="settings-nav-group">Hermes</span>
          <button
            type="button"
            className={`settings-nav-item ${
              section === 'connection' ? 'is-active' : ''
            }`}
            aria-current={section === 'connection' ? 'page' : undefined}
            onClick={() => setSection('connection')}
          >
            Connection
          </button>
          <button
            type="button"
            className={`settings-nav-item ${
              section === 'models' ? 'is-active' : ''
            }`}
            aria-current={section === 'models' ? 'page' : undefined}
            onClick={() => setSection('models')}
          >
            Models
          </button>
          <button
            type="button"
            className={`settings-nav-item ${
              section === 'updates' ? 'is-active' : ''
            }`}
            aria-current={section === 'updates' ? 'page' : undefined}
            onClick={() => setSection('updates')}
          >
            Updates
          </button>
          <button
            type="button"
            className={`settings-nav-item ${
              section === 'setup' ? 'is-active' : ''
            }`}
            aria-current={section === 'setup' ? 'page' : undefined}
            onClick={() => setSection('setup')}
          >
            Setup
          </button>
        </nav>
      </aside>

      <main className="settings-pane">
        <div className="settings-pane-inner">
          {section === 'connection' ? (
            <div className="settings-page">
              <header className="settings-page-head">
                <div>
                  <h2>Connection</h2>
                  <p>
                    Link Hermes Bot to the Hermes Agent running on your machine.
                  </p>
                </div>
                <div className="settings-page-side">
                  <span className="connection-state" data-state={status.state}>
                    <span className="connection-state-dot" aria-hidden="true" />
                    <span className="connection-state-text">
                      {STATE_LABEL[status.state]}
                      {status.state === 'connected' && status.version
                        ? ` · Hermes ${status.version}`
                        : null}
                    </span>
                  </span>
                  {status.state === 'connected' ? (
                    <button
                      type="button"
                      className="settings-page-action"
                      disabled={disabled}
                      onClick={handleDisconnect}
                    >
                      {busy === 'disconnect' ? 'Closing…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="settings-page-action"
                      disabled={disabled}
                      onClick={handleConnect}
                    >
                      {busy === 'connect' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </header>

              {bridge ? null : (
                <p className="settings-notice">
                  Connection settings are only available inside the desktop app.
                </p>
              )}

              <section className="settings-card">
                <header className="settings-card-head">
                  <div>
                    <h3>Server</h3>
                    <p>How Hermes Bot reaches Hermes.</p>
                  </div>
                  <span className="settings-card-meta">
                    {hasKey ? 'Key in Keychain' : 'No key stored'}
                  </span>
                </header>

                <div className="settings-form">
                  <label className="settings-field">
                    <span className="settings-field-label">SSH host</span>
                    <input
                      id="connection-host"
                      type="text"
                      value={host}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="my-hermes-host"
                      disabled={Boolean(busy)}
                      onChange={(event) => {
                        setHost(event.target.value);
                        setError('');
                        setNotice('');
                      }}
                    />
                    <span className="settings-field-note">
                      The machine running Hermes, reached with your existing SSH
                      config.
                    </span>
                  </label>

                  <div className="settings-field">
                    <label
                      className="settings-field-label"
                      htmlFor="connection-key"
                    >
                      API key
                    </label>
                    <input
                      id="connection-key"
                      type="password"
                      value={apiKey}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={Boolean(busy)}
                      placeholder={
                        hasKey ? 'Saved in Keychain' : 'Paste API_SERVER_KEY'
                      }
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setError('');
                        setNotice('');
                      }}
                    />
                    <div className="settings-field-actions">
                      <button
                        type="button"
                        className="settings-text-button"
                        disabled={disabled || !host.trim()}
                        onClick={handleImportKey}
                      >
                        {busy === 'import'
                          ? 'Reading…'
                          : `Import from ${host || 'server'}`}
                      </button>
                      {hasKey ? (
                        <button
                          type="button"
                          className="settings-text-button is-muted"
                          disabled={disabled}
                          onClick={handleClearKey}
                        >
                          {busy === 'clear' ? 'Removing…' : 'Remove stored key'}
                        </button>
                      ) : null}
                    </div>
                    <span className="settings-field-note">
                      Kept in the macOS Keychain, never written by Hermes Bot.
                    </span>
                  </div>
                </div>
              </section>

              <section
                className={`settings-card ${advanced ? 'is-open' : ''}`}
              >
                <header className="settings-card-head">
                  <div>
                    <h3>Advanced</h3>
                    <p>Ports, tunnel and launch behaviour.</p>
                  </div>
                  <button
                    type="button"
                    className="settings-card-chevron-button"
                    aria-expanded={advanced}
                    aria-label={
                      advanced
                        ? 'Hide advanced settings'
                        : 'Show advanced settings'
                    }
                    title={advanced ? 'Hide advanced settings' : 'Show advanced settings'}
                    onClick={() => setAdvanced((current) => !current)}
                  >
                    <span
                      className="settings-card-chevron"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                </header>

                {advanced ? (
                  <div className="settings-card-body">
                    <div className="settings-field-grid">
                      <label className="settings-field">
                        <span className="settings-field-label">
                          Remote API port
                        </span>
                        <input
                          type="number"
                          value={port}
                          min={1}
                          max={65535}
                          spellCheck={false}
                          disabled={Boolean(busy)}
                          onChange={(event) => {
                            setPort(event.target.value);
                            setError('');
                            setNotice('');
                          }}
                        />
                      </label>
                      <label className="settings-field">
                        <span className="settings-field-label">
                          Local tunnel port
                        </span>
                        <input
                          type="number"
                          value={localPort}
                          min={1}
                          max={65535}
                          spellCheck={false}
                          disabled={Boolean(busy)}
                          onChange={(event) => {
                            setLocalPort(event.target.value);
                            setError('');
                            setNotice('');
                          }}
                        />
                      </label>
                    </div>

                    <div className="settings-facts">
                      <div className="settings-fact">
                        <span>Local tunnel</span>
                        <code>{tunnelUrl}</code>
                      </div>
                      <div className="settings-fact">
                        <span>SSH command</span>
                        <code>{tunnelCommand}</code>
                      </div>
                    </div>

                    <div className="settings-switch-row">
                      <span className="settings-switch-copy">
                        Connect on launch
                        <em>Open the tunnel as soon as Hermes Bot starts.</em>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoConnect}
                        aria-label="Connect on launch"
                        className={`settings-switch ${
                          autoConnect ? 'is-on' : ''
                        }`}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setAutoConnect((current) => !current);
                          setError('');
                          setNotice('');
                        }}
                      >
                        <span className="settings-switch-knob" />
                      </button>
                    </div>

                    <div className="settings-card-foot">
                      <button
                        type="button"
                        className="settings-text-button is-muted"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setPort('8642');
                          setLocalPort('18742');
                          setAutoConnect(false);
                          setError('');
                          setNotice('Advanced settings reset — save to apply.');
                        }}
                      >
                        Reset to defaults
                      </button>
                      <span className="settings-hint">
                        The server key lives in <code>~/.hermes/.env</code>.
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="settings-page-actions">
                {feedback ? (
                  <p className="settings-feedback" data-tone={feedback.tone}>
                    <span className="settings-feedback-dot" aria-hidden="true" />
                    {feedback.text}
                  </p>
                ) : null}
                <div className="settings-page-buttons">
                  <button
                    type="button"
                    className="settings-action"
                    disabled={!canTest}
                    onClick={handleTest}
                  >
                    {busy === 'test' ? 'Testing…' : 'Test connection'}
                  </button>
                  <button
                    type="button"
                    className="settings-action is-primary"
                    disabled={disabled || !host.trim()}
                    onClick={handleSave}
                  >
                    {busy === 'save'
                      ? 'Connecting…'
                      : status.state === 'connected'
                        ? 'Save & reconnect'
                        : 'Save & connect'}
                  </button>
                </div>
              </div>
            </div>
          ) : section === 'setup' ? (
            <div className="settings-page">
              <header className="settings-page-head">
                <div>
                  <h2>Setup</h2>
                  <p>Walk through the door again, step by step.</p>
                </div>
              </header>
              <section className="settings-card">
                <header className="settings-card-head">
                  <div>
                    <h3>The guided setup</h3>
                    <p>
                      The host, the key, the handshake, the crew — one question
                      at a time.
                    </p>
                  </div>
                </header>

                <div className="settings-card-body">
                  <p className="settings-hint">
                    Nothing is changed until you say so: the setup writes down
                    the host and the key, and the rest it only reads.
                  </p>
                  <div className="settings-page-buttons">
                    <button
                      type="button"
                      className="settings-action is-primary"
                      onClick={onRunSetup}
                    >
                      Run the setup again
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : section === 'updates' ? (
            <UpdatesSettings />
          ) : (
            <ModelsSettings connected={status.state === 'connected'} />
          )}
        </div>
      </main>

    </div>
  );
}
