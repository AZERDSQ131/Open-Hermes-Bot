import { useEffect, useState } from 'react';
import type { HermesSettings, HermesStatus } from '../hermes';
import { ChevronLeftIcon, GearIcon } from './Icons';

type SettingsViewProps = {
  status: HermesStatus;
  onClose: () => void;
  onStatusChange: (status: HermesStatus) => void;
};

type BusyAction = 'test' | 'save' | 'import' | 'disconnect' | 'clear' | null;

const STATUS_LABEL: Record<HermesStatus['state'], string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting...',
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
        setHasKey(settings.hasKey);
      })
      .catch(() => undefined);
    bridge
      ?.localPort()
      .then((value) => {
        if (!cancelled) setLocalPort(String(value));
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

  const disabled = Boolean(busy) || !bridge;
  const canTest = !disabled && host.trim() !== '' && (hasKey || apiKey.trim() !== '');

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
          title="Back to Sidekick  Esc"
        >
          <ChevronLeftIcon size={14} />
          Sidekick
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
            <span className="settings-nav-label">Connection</span>
            <span
              className={`hermes-dot is-${status.state}`}
              aria-hidden="true"
            />
          </button>
        </nav>

        <div className="settings-rail-foot">
          <GearIcon size={13} />
          Sidekick
        </div>
      </aside>

      <main className="settings-pane">
        <div className="settings-pane-inner">
          <header className="settings-pane-head">
            <h2>Connection</h2>
            <p>Link Sidekick to the Hermes Agent running on your machine.</p>
          </header>

          {bridge ? null : (
            <p className="settings-warning">
              Connection settings are only available inside the desktop app.
            </p>
          )}

          <div className="settings-status" data-state={status.state}>
            <span className="settings-status-dot" aria-hidden="true" />
            <span className="settings-status-text">
              {STATUS_LABEL[status.state]}
              {status.state === 'connected' && status.sshHost
                ? ` · ${status.sshHost}`
                : null}
              {status.state === 'connected' && status.version
                ? ` · Hermes ${status.version}`
                : null}
              {status.state === 'connected' && status.gateway
                ? ` · gateway ${status.gateway}`
                : null}
            </span>
            {status.state === 'connected' ? (
              <button
                type="button"
                className="settings-inline-button"
                disabled={disabled}
                onClick={handleDisconnect}
              >
                {busy === 'disconnect' ? 'Closing...' : 'Disconnect'}
              </button>
            ) : null}
          </div>

          {status.state === 'error' && status.message ? (
            <p className="settings-error">{status.message}</p>
          ) : null}

          <div className="settings-fields">
            <label className="field">
              <span>SSH host</span>
              <input
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
            </label>

            <label className="field">
              <span>API key</span>
              <input
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
            </label>

            <div className="settings-key-row">
              <button
                type="button"
                className="settings-text-button"
                disabled={disabled || !host.trim()}
                onClick={handleImportKey}
              >
                {busy === 'import' ? 'Reading...' : `Import key from ${host || 'server'}`}
              </button>
              {hasKey ? (
                <button
                  type="button"
                  className="settings-text-button is-muted"
                  disabled={disabled}
                  onClick={handleClearKey}
                >
                  {busy === 'clear' ? 'Removing...' : 'Remove stored key'}
                </button>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={`settings-advanced-toggle ${advanced ? 'is-open' : ''}`}
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
              <label className="field">
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
              <div className="settings-readout">
                <span>Local tunnel</span>
                <code>127.0.0.1:{localPort}</code>
              </div>
              <p className="settings-hint">
                Sidekick forwards the remote API over SSH and keeps the key in
                the macOS Keychain. The server key lives in{' '}
                <code>~/.hermes/.env</code>.
              </p>
            </div>
          ) : null}

          {testStatus ? (
            <div className="settings-test" data-state={testStatus.state}>
              <span className="settings-status-dot" aria-hidden="true" />
              <span>
                {testStatus.state === 'connected'
                  ? `Reachable · Hermes ${testStatus.version ?? '?'} · gateway ${
                      testStatus.gateway ?? '?'
                    }`
                  : testStatus.message ?? 'Could not reach the server'}
              </span>
            </div>
          ) : null}

          {error ? <p className="settings-error">{error}</p> : null}
          {notice ? <p className="settings-notice">{notice}</p> : null}

          <div className="settings-actions">
            <button
              type="button"
              className="settings-action"
              disabled={!canTest}
              onClick={handleTest}
            >
              {busy === 'test' ? 'Testing...' : 'Test connection'}
            </button>
            <button
              type="button"
              className="settings-action is-primary"
              disabled={disabled || !host.trim()}
              onClick={handleSave}
            >
              {busy === 'save'
                ? 'Connecting...'
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
