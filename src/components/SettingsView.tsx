import { useEffect, useMemo, useState } from 'react';
import type { HermesModel, HermesSettings, HermesStatus } from '../hermes';
import {
  defaultModelFor,
  isFavorite,
  isHidden,
  modelId,
  setDefaultModel,
  setModelVisible,
  toggleModelFavorite,
  useModelPrefs,
} from '../modelPrefs';
import { ChevronLeftIcon, StarIcon } from './Icons';

type Section = 'connection' | 'models';

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
  const [section, setSection] = useState<Section>('connection');
  const [models, setModels] = useState<HermesModel[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [profiles, setProfiles] = useState<string[] | null>(null);
  const [profilesError, setProfilesError] = useState('');
  const [modelNeedle, setModelNeedle] = useState('');
  const [modelsReload, setModelsReload] = useState(0);
  const [busy, setBusy] = useState<BusyAction>(null);
  const prefs = useModelPrefs();
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

  // The inventory is only fetched when the Models section is open, and again
  // whenever Refresh is pressed: the gateway answers slowly over the tunnel.
  useEffect(() => {
    if (section !== 'models' || !bridge?.models) return;
    let cancelled = false;
    setModelsLoading(true);
    setModelsError('');
    bridge
      .models({})
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setModelsError(result.error ?? 'Could not list the models');
          return;
        }
        setModels(result.models ?? []);
      })
      .catch((reason: Error) => {
        if (!cancelled) setModelsError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, bridge, modelsReload]);

  // Bots live on the server, so their names come from there rather than from
  // the threads this window happens to hold.
  useEffect(() => {
    if (section !== 'models' || !bridge?.profiles) return;
    let cancelled = false;
    setProfilesError('');
    bridge
      .profiles()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setProfilesError(result.error ?? 'Could not list the bots');
          return;
        }
        setProfiles(result.profiles ?? []);
      })
      .catch((reason: Error) => {
        if (!cancelled) setProfilesError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [section, bridge, modelsReload]);

  const bots = useMemo(
    () => [
      { key: 'default', label: 'Primary profile', profile: undefined },
      ...(profiles ?? []).map((name) => ({
        key: name,
        label: name,
        profile: name,
      })),
    ],
    [profiles],
  );

  // Only what the picker would offer can become a default: a hidden model is
  // cleared from every bot when it is hidden.
  const offeredModels = useMemo(
    () => (models ?? []).filter((entry) => !isHidden(prefs, modelId(entry))),
    [models, prefs],
  );

  const modelGroups = useMemo(() => {
    const needle = modelNeedle.trim().toLowerCase();
    const byProvider = new Map<string, HermesModel[]>();
    for (const entry of models ?? []) {
      if (needle && !entry.model.toLowerCase().includes(needle)) continue;
      const key = entry.providerName || entry.provider;
      const list = byProvider.get(key) ?? [];
      list.push(entry);
      byProvider.set(key, list);
    }
    // Kept in the gateway's order: a row must not jump under the cursor when
    // its star is clicked. Favourites float to the top of the composer only.
    return [...byProvider.entries()];
  }, [models, modelNeedle]);

  const totalModels = models?.length ?? 0;
  const hiddenModels = models
    ? models.filter((entry) => isHidden(prefs, modelId(entry))).length
    : 0;

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
        </nav>
      </aside>

      <main className="settings-pane">
        <div className="settings-pane-inner">
          {section === 'connection' ? (
          <>
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
          </>
          ) : (
            <>
              <header className="connection-head">
                <div className="connection-head-copy">
                  <h2>Models</h2>
                  <p>
                    Choose what the composer offers. A model switched off stays
                    in Hermes — it just disappears from the picker.
                  </p>
                </div>
                <button
                  type="button"
                  className="settings-action"
                  disabled={!bridge?.models || modelsLoading}
                  onClick={() => setModelsReload((count) => count + 1)}
                >
                  {modelsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </header>

              {bridge?.models ? null : (
                <p className="settings-warning">
                  Model settings are only available inside the desktop app.
                </p>
              )}

              {bridge?.models && status.state !== 'connected' ? (
                <p className="settings-warning">
                  The tunnel is closed. Connect from the Connection section to
                  list the models — your choices are kept.
                </p>
              ) : null}

              <div className="model-admin">
                <section className="model-defaults">
                  <div className="model-admin-section-head">
                    <h3>Bot defaults</h3>
                    <span>Used when a conversation has no model picked.</span>
                  </div>

                  {profilesError ? (
                    <p className="model-error">{profilesError}</p>
                  ) : null}

                  <div className="model-defaults-list">
                    {bots.map((bot) => {
                      const current = defaultModelFor(prefs, bot.profile);
                      return (
                        <div className="model-default-row" key={bot.key}>
                          <span className="model-default-bot">{bot.label}</span>
                          <select
                            className="model-default-select"
                            aria-label={`Default model for ${bot.label}`}
                            value={current ? modelId(current) : ''}
                            disabled={!models}
                            onChange={(event) => {
                              const ref = offeredModels.find(
                                (entry) =>
                                  modelId(entry) === event.target.value,
                              );
                              setDefaultModel(
                                bot.profile,
                                ref
                                  ? {
                                      model: ref.model,
                                      provider: ref.provider,
                                    }
                                  : null,
                              );
                            }}
                          >
                            <option value="">
                              This bot&apos;s configured model
                            </option>
                            {offeredModels.map((entry) => (
                              <option
                                key={modelId(entry)}
                                value={modelId(entry)}
                              >
                                {entry.model}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <div className="model-admin-divider" />

                <div className="model-admin-toolbar">
                  <input
                    className="model-admin-search"
                    type="search"
                    value={modelNeedle}
                    placeholder="Search models"
                    spellCheck={false}
                    onChange={(event) => setModelNeedle(event.target.value)}
                  />
                  <span className="model-admin-count">
                    {modelsLoading
                      ? 'Reading the gateway…'
                      : `${totalModels - hiddenModels} of ${totalModels} shown`}
                  </span>
                </div>

                {modelsError ? (
                  <p className="model-error">{modelsError}</p>
                ) : null}

                {!models && modelsLoading ? (
                  <p className="model-note">Loading models…</p>
                ) : null}

                <div className="model-admin-list">
                  {modelGroups.map(([providerName, entries]) => {
                    const shown = entries.filter(
                      (entry) => !isHidden(prefs, modelId(entry)),
                    ).length;
                    return (
                      <section
                        className="model-admin-group"
                        key={providerName}
                      >
                        <header className="model-admin-group-head">
                          <span>{providerName}</span>
                          <span>
                            {shown}/{entries.length}
                          </span>
                        </header>
                        {entries.map((entry) => {
                          const id = modelId(entry);
                          const checked = !isHidden(prefs, id);
                          const favorite = isFavorite(prefs, id);
                          return (
                            <div
                              className={`model-admin-row ${
                                checked ? '' : 'is-unlisted'
                              }`}
                              key={id}
                            >
                              <span className="model-admin-name">
                                {entry.model}
                              </span>
                              {entry.current ? (
                                <span className="model-tag">current</span>
                              ) : null}
                              <button
                                type="button"
                                className={`model-admin-star ${
                                  favorite ? 'is-on' : ''
                                }`}
                                aria-pressed={favorite}
                                aria-label={
                                  favorite
                                    ? `Remove ${entry.model} from favorites`
                                    : `Add ${entry.model} to favorites`
                                }
                                title={
                                  favorite
                                    ? 'Remove from favorites'
                                    : 'Add to favorites'
                                }
                                onClick={() => toggleModelFavorite(id)}
                              >
                                <StarIcon filled={favorite} />
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={checked}
                                aria-label={`List ${entry.model} in the picker`}
                                title={
                                  checked
                                    ? 'Listed in the model picker'
                                    : 'Hidden from the model picker'
                                }
                                className={`model-switch ${
                                  checked ? 'is-on' : ''
                                }`}
                                onClick={() => setModelVisible(id, !checked)}
                              >
                                <span className="model-switch-knob" />
                              </button>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>

                {models && modelGroups.length === 0 ? (
                  <p className="model-note">
                    No authenticated provider offers a model yet.
                  </p>
                ) : null}
              </div>

              <div className="settings-actions model-admin-foot">
                <span className="settings-hint">
                  A model picked inside a conversation still wins over the bot
                  default.
                </span>
                <button
                  type="button"
                  className="settings-text-button"
                  disabled={prefs.hidden.length === 0}
                  onClick={() => {
                    for (const id of prefs.hidden) setModelVisible(id, true);
                  }}
                >
                  Show all models
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
