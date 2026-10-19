import { useEffect, useState, type FormEvent } from 'react';
import type { HermesSettings, HermesStatus } from '../hermes';
import { GearIcon } from './Icons';

type SettingsDialogProps = {
  onClose: () => void;
  onStatusChange: (status: HermesStatus) => void;
};

const STATUS_LABEL: Record<HermesStatus['state'], string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Connection failed',
};

export function SettingsDialog({
  onClose,
  onStatusChange,
}: SettingsDialogProps) {
  const bridge = window.hermes;
  const [host, setHost] = useState('jetson');
  const [port, setPort] = useState('8642');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<HermesStatus>({ state: 'disconnected' });
  const [busy, setBusy] = useState(false);
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
      ?.status()
      .then((current) => {
        if (!cancelled) setStatus(current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function report(next: HermesStatus) {
    setStatus(next);
    onStatusChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!bridge) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await bridge.saveSettings({
        sshHost: host,
        apiPort: Number.parseInt(port, 10),
        apiKey: apiKey.trim() || undefined,
      });
      if (!saved.ok) {
        setError(saved.error ?? 'Could not save the connection');
        return;
      }
      if (saved.settings) setHasKey(saved.settings.hasKey);
      setApiKey('');
      report(await bridge.connect());
    } finally {
      setBusy(false);
    }
  }

  async function handleImportKey() {
    if (!bridge) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await bridge.importKey();
      if (!result.ok) {
        setError(result.error ?? 'Could not read the key from the server');
        return;
      }
      setHasKey(true);
      setNotice(
        `Key imported from ${host} (${result.keyLength ?? '?'} characters).`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!bridge) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      report(await bridge.disconnect());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={handleSubmit}
      >
        <div className="modal-body">
          <div className="modal-head">
            <div className="settings-head">
              <span className="settings-head-icon">
                <GearIcon size={18} />
              </span>
              <div>
                <h2 id="settings-title">Settings</h2>
                <p>Connect Sidekick to your Hermes Agent.</p>
              </div>
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {bridge ? null : (
            <p className="settings-warning">
              Connection settings are only available inside the desktop app.
            </p>
          )}

          <div className="settings-status" data-state={status.state}>
            <span className="settings-status-dot" aria-hidden="true" />
            <span className="settings-status-text">
              {STATUS_LABEL[status.state]}
              {status.state === 'connected' && status.version
                ? ` · Hermes ${status.version}`
                : null}
              {status.state === 'connected' && status.gateway
                ? ` · gateway ${status.gateway}`
                : null}
            </span>
          </div>

          {status.state === 'error' && status.message ? (
            <p className="settings-error">{status.message}</p>
          ) : null}
          {error ? <p className="settings-error">{error}</p> : null}
          {notice ? <p className="settings-notice">{notice}</p> : null}

          <label className="field">
            <span>SSH host</span>
            <input
              type="text"
              value={host}
              spellCheck={false}
              placeholder="jetson"
              onChange={(event) => setHost(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Remote API port</span>
            <input
              type="number"
              value={port}
              min={1}
              max={65535}
              spellCheck={false}
              onChange={(event) => setPort(event.target.value)}
            />
          </label>

          <label className="field">
            <span>API key (API_SERVER_KEY)</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder={
                hasKey ? 'Stored in Keychain — leave empty to keep' : 'Paste the key'
              }
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>

          <div className="settings-key-row">
            <button
              type="button"
              className="button-ghost settings-key-button"
              disabled={busy || !bridge}
              onClick={handleImportKey}
            >
              Import key from {host || 'server'}
            </button>
            {hasKey ? (
              <button
                type="button"
                className="button-ghost settings-key-button"
                disabled={busy || !bridge}
                onClick={() => {
                  setApiKey('');
                  setHasKey(false);
                  setNotice('Key cleared — connect to save a new one.');
                  bridge
                    ?.saveSettings({
                      sshHost: host,
                      apiPort: Number.parseInt(port, 10),
                      clearKey: true,
                    })
                    .catch(() => undefined);
                }}
              >
                Clear key
              </button>
            ) : null}
          </div>

          <p className="settings-hint">
            Sidekick opens an SSH tunnel to the remote Hermes API server
            (127.0.0.1:{port || '8642'}) and keeps the key in the macOS
            Keychain. The key lives in <code>~/.hermes/.env</code> on the
            server.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="button-ghost"
            disabled={busy || !bridge || status.state === 'disconnected'}
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={busy || !bridge}
          >
            {busy
              ? 'Working...'
              : status.state === 'connected'
                ? 'Reconnect'
                : 'Save & connect'}
          </button>
        </div>
      </form>
    </div>
  );
}
