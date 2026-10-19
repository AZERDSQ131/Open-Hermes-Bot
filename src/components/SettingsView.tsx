import { useEffect, useState } from 'react';
import type { HermesSettings, HermesStatus } from '../hermes';
import { ChevronLeftIcon } from './Icons';

type SettingsViewProps = {
  status: HermesStatus;
  onClose: () => void;
  onStatusChange: (status: HermesStatus) => void;
};

type BusyAction = 'test' | 'save' | 'import' | 'disconnect' | 'clear' | null;

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
}: SettingsViewProps) {
  const bridge = window.hermes;
  const [host, setHost] = useState('jetson');
  const [port, setPort] = useState('8642');
  const [localPort, setLocalPort] = useState('18742');
  const [autoConnect, setAutoConnect] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
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
  } ${host || 'jetson'}`;

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
          aria-label="Back to Sidekick"
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
            className="settings-nav-item is-active"
            aria-current="page"
          >
            Connection
          </button>
        </nav>
      </aside>

      <main className="settings-pane">
        <div className="settings-pane-inner">
          <header className="connection-head">
            <div className="connection-head-copy">
              <h2>Connection</h2>
              <p>Link Sidekick to the Hermes Agent running on your machine.</p>
            </div>
            <div className="connection-state" data-state={status.state}>
              <span className="connection-state-dot" aria-hidden="true" />
              <span className="connection-state-text">
                {STATE_LABEL[status.state]}
                {status.state === 'connected' && status.version
                  ? ` · Hermes ${status.version}`
                  : null}
              </span>
              {status.state === 'connected' ? (
                <button
                  type="button"
                  className="connection-state-action"
                  disabled={disabled}
                  onClick={handleDisconnect}
                >
                  {busy === 'disconnect' ? 'Closing…' : 'Disconnect'}
                </button>
              ) : null}
            </div>
          </header>

          {bridge ? null : (
            <p className="settings-warning">
              Connection settings are only available inside the desktop app.
            </p>
          )}

          <div className="connection-rows">
            <div className="connection-row">
              <label className="connection-label" htmlFor="connection-host">
                SSH host
              </label>
              <div className="connection-control">
                <input
                  id="connection-host"
                  type="text"
                  value={host}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="jetson"
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    setHost(event.target.value);
                    setError('');
                    setNotice('');
                  }}
                />
                <span className="connection-note">
                  The machine running Hermes, over your existing SSH config.
                </span>
              </div>
            </div>

            <div className="connection-row">
              <label className="connection-label" htmlFor="connection-key">
                API key
              </label>
              <div className="connection-control">
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
                <div className="connection-key-actions">
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
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`settings-advanced-toggle ${
              advanced ? 'is-open' : ''
            }`}
            aria-expanded={advanced}
            onClick={() => setAdvanced((current) => !current)}
          >
            <span className="settings-advanced-chevron" aria-hidden="true">
              ›
            </span>
            Advanced settings
          </button>

          {advanced ? (
            <div className="settings-advanced">
              <div className="settings-advanced-grid">
                <label className="connection-field">
                  <span>Remote API port</span>
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
                <label className="connection-field">
                  <span>Local tunnel port</span>
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

              <div className="settings-advanced-list">
                <div className="settings-advanced-item">
                  <span>Local tunnel</span>
                  <code>{tunnelUrl}</code>
                </div>
                <div className="settings-advanced-item">
                  <span>SSH command</span>
                  <code>{tunnelCommand}</code>
                </div>
                <div className="settings-advanced-item">
                  <span>Key storage</span>
                  <code>macOS Keychain</code>
                </div>
                <label className="settings-advanced-item settings-advanced-switch">
                  <span>
                    Connect on launch
                    <em>Open the tunnel as soon as Sidekick starts.</em>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoConnect}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      setAutoConnect(event.target.checked);
                      setError('');
                      setNotice('');
                    }}
                  />
                </label>
              </div>

              <div className="settings-advanced-foot">
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

          <div className="settings-actions">
            {feedback ? (
              <p className="connection-feedback" data-tone={feedback.tone}>
                <span className="connection-feedback-dot" aria-hidden="true" />
                {feedback.text}
              </p>
            ) : null}
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
      </main>
    </div>
  );
}
