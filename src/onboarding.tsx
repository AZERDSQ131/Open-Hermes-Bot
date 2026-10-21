import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HermesProfile, HermesStatus } from './hermes';
import { AgentAvatar } from './components/AgentAvatar';
import { BloubSvg, botShape } from './components/Bloub';
import { ColorGrid, ShapeGrid } from './components/LogoControls';
import type { BloubShape, BloubVariant } from './components/bloubFrames';
import { toProfileId } from './components/CreateAgentDialog';
import { avatarColor, profileColor } from './profileColor';

/**
 * The setup: the door the person walks through the first time the app opens.
 *
 * It asks three things — where Hermes lives, the key that opens the door, and
 * who answers on the other side — and it asks them one at a time, because a
 * person who is setting up a machine is already carrying enough.
 *
 * Nothing here is kept by the app but the answer to "has this been done".
 * The connection goes to the app's own record, the key to the Keychain, and
 * the bots stay where they are: on the host.
 */

type StepId = 'welcome' | 'host' | 'key' | 'connect' | 'crew' | 'ready';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'host', label: 'The host' },
  { id: 'key', label: 'The key' },
  { id: 'connect', label: 'The handshake' },
  { id: 'crew', label: 'Your crew' },
  { id: 'ready', label: 'All set' },
];

const DEFAULT_COLOR = '#5b5bda';

/** The face the mascot wears, one per step. */
const MASCOT: Record<
  StepId,
  { shape: BloubShape; variant: BloubVariant }
> = {
  welcome: { shape: 'nuage', variant: 'curious' },
  host: { shape: 'nuage', variant: 'neutral' },
  key: { shape: 'nuage', variant: 'attentive' },
  connect: { shape: 'nuage', variant: 'attentive' },
  crew: { shape: 'nuage', variant: 'wide' },
  ready: { shape: 'nuage', variant: 'wink' },
};

type CheckState = 'waiting' | 'working' | 'done' | 'failed';

type Check = {
  id: string;
  label: string;
  state: CheckState;
  detail?: string;
};

const CHECKS: { id: string; label: string }[] = [
  { id: 'reach', label: 'The host answers' },
  { id: 'key', label: 'The key is accepted' },
  { id: 'tunnel', label: 'The tunnel is open' },
];

function emptyChecks(): Check[] {
  return CHECKS.map((check) => ({ ...check, state: 'waiting' }));
}

function markCheck(
  checks: Check[],
  id: string,
  state: CheckState,
  detail?: string,
): Check[] {
  return checks.map((check) =>
    check.id === id
      ? { ...check, state, detail: detail ?? check.detail }
      : check,
  );
}

type OnboardingProps = {
  /** The setup is done: the app takes over. */
  onFinish: () => void;
  /** The person walked away from the setup. */
  onDismiss: () => void;
};

export function Onboarding({ onFinish, onDismiss }: OnboardingProps) {
  const bridge = window.hermes;
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [host, setHost] = useState('');
  const [apiPort, setApiPort] = useState('8642');
  const [localPort, setLocalPort] = useState('18742');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<'none' | 'import' | 'handshake' | 'bot'>(
    'none',
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checks, setChecks] = useState<Check[]>(emptyChecks);
  const [connected, setConnected] = useState(false);
  const [bots, setBots] = useState<HermesProfile[]>([]);
  const [primary, setPrimary] = useState<HermesProfile | undefined>(undefined);
  const [botName, setBotName] = useState('');
  const [botFace, setBotFace] = useState<BloubShape>('cercle');
  const [botColor, setBotColor] = useState(DEFAULT_COLOR);
  const [botTouched, setBotTouched] = useState(false);

  const step = STEPS[stepIndex].id;

  // The setup starts from what the app already knows: a host that is already
  // written down is a host the person does not have to type twice.
  useEffect(() => {
    let cancelled = false;
    bridge
      ?.getSettings?.()
      .then((settings) => {
        if (cancelled) return;
        setHost(settings.sshHost ?? '');
        setApiPort(String(settings.apiPort ?? 8642));
        setLocalPort(String(settings.localPort ?? 18742));
        setHasKey(Boolean(settings.hasKey));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // The face of a new bot follows its name, the way Hermes colours it.
  useEffect(() => {
    if (botTouched) return;
    setBotColor(profileColor(toProfileId(botName)) ?? DEFAULT_COLOR);
  }, [botName, botTouched]);

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > stepIndex ? 'forward' : 'back');
      setStepIndex(index);
      setError('');
      setNotice('');
    },
    [stepIndex],
  );

  const loadCrew = useCallback(async () => {
    if (!bridge?.profiles) return;
    try {
      const result = await bridge.profiles();
      if (!result.ok) return;
      setBots(result.profiles ?? []);
      setPrimary(result.primary);
    } catch {
      // A crew that cannot be listed is not a reason to block the setup: the
      // app asks the server again once it is open.
    }
  }, [bridge]);

  const runHandshake = useCallback(async () => {
    if (!bridge?.test) return;
    setBusy('handshake');
    setError('');
    setChecks(emptyChecks());
    setChecks((current) => markCheck(current, 'reach', 'working'));
    const port = Number.parseInt(apiPort, 10) || 8642;
    const key = apiKey.trim();

    let result: HermesStatus;
    try {
      result = await bridge.test({
        sshHost: host,
        apiPort: port,
        apiKey: key || undefined,
      });
    } catch (reason) {
      result = {
        state: 'error',
        message:
          reason instanceof Error && reason.message
            ? reason.message
            : 'The host did not answer.',
      };
    }

    if (result.state !== 'connected') {
      setChecks((current) => markCheck(current, 'reach', 'failed'));
      setError(result.message ?? 'The host did not answer.');
      setBusy('none');
      return;
    }

    setChecks((current) =>
      markCheck(
        markCheck(current, 'reach', 'done', `Hermes ${result.version ?? '?'}`),
        'key',
        'done',
        `gateway ${result.gateway ?? 'ok'}`,
      ),
    );
    setChecks((current) => markCheck(current, 'tunnel', 'working'));

    // The key and the host are written down now: the tunnel that follows is
    // the one the app will use from here on.
    const saved = await bridge
      ?.saveSettings?.({
        sshHost: host,
        apiPort: port,
        localPort: Number.parseInt(localPort, 10) || 18742,
        apiKey: key || undefined,
      })
      .catch((reason: Error) => ({
        ok: false,
        error: reason.message,
        settings: undefined,
      }));

    if (!saved?.ok) {
      setChecks((current) => markCheck(current, 'tunnel', 'failed'));
      setError(saved?.error ?? 'The connection could not be saved.');
      setBusy('none');
      return;
    }
    if (saved.settings) setHasKey(Boolean(saved.settings.hasKey));

    const status = await bridge
      ?.connect?.()
      .catch((reason: Error) => ({
        state: 'error' as const,
        message: reason.message,
      }));

    if (status?.state !== 'connected') {
      setChecks((current) => markCheck(current, 'tunnel', 'failed'));
      setError(status?.message ?? 'The tunnel did not open.');
      setBusy('none');
      return;
    }

    setChecks((current) =>
      markCheck(current, 'tunnel', 'done', `127.0.0.1:${localPort}`),
    );
    setConnected(true);
    setBusy('none');
  }, [apiKey, apiPort, bridge, host, localPort]);

  // The handshake runs by itself: the person has given the host and the key,
  // and there is nothing left to decide.
  useEffect(() => {
    if (step !== 'connect') return;
    void runHandshake();
  }, [runHandshake, step]);

  // The crew is read back from the host, the way the app reads everything
  // else: the sidebar is the server's own list of bots.
  useEffect(() => {
    if (step !== 'crew') return;
    void loadCrew();
  }, [loadCrew, step]);

  async function handleImport() {
    if (!bridge?.importKey) return;
    setBusy('import');
    setError('');
    setNotice('');
    const result = await bridge
      .importKey({ sshHost: host })
      .catch((reason: Error) => ({ ok: false, error: reason.message }));
    if (result.ok) {
      setHasKey(true);
      setApiKey('');
      setNotice(`Read from ${host || 'the server'} and kept in the Keychain.`);
    } else {
      setError(result.error ?? 'The key could not be read from the server.');
    }
    setBusy('none');
  }

  async function handleCreateBot() {
    if (!bridge?.createBot) return;
    const title = botName.trim();
    if (!title) return;
    setBusy('bot');
    setError('');
    setNotice('');
    const result = await bridge
      .createBot({
        name: toProfileId(title),
        title,
        color: botTouched ? botColor : undefined,
        shape: botFace,
        description: 'Bot created from the Hermes Bot setup',
      })
      .catch((reason: Error) => ({ ok: false, error: reason.message }));
    if (!result.ok) {
      setError(result.error ?? 'The bot could not be created.');
      setBusy('none');
      return;
    }
    setBotName('');
    setBotTouched(false);
    setNotice(`${title} is on the host.`);
    setBusy('none');
    await loadCrew();
  }

  async function remember(completed: boolean) {
    try {
      await bridge?.setOnboarding?.({ completed });
    } catch {
      // The flag is a convenience: the setup can be run again by hand, from
      // the settings, whether the app managed to write it down or not.
    }
  }

  async function handleFinish() {
    await remember(true);
    onFinish();
  }

  async function handleDismiss() {
    await remember(true);
    onDismiss();
  }

  const canContinue = useMemo(() => {
    switch (step) {
      case 'welcome':
        return true;
      case 'host':
        return host.trim() !== '';
      case 'key':
        return hasKey || apiKey.trim() !== '';
      case 'connect':
        return connected;
      default:
        return true;
    }
  }, [apiKey, connected, hasKey, host, step]);

  const isLast = stepIndex === STEPS.length - 1;
  const tunnelCommand = `ssh -N -L 127.0.0.1:${
    localPort || '18742'
  }:127.0.0.1:${apiPort || '8642'} ${host || '<host>'}`;
  const crewSummary = useMemo(() => {
    const count = bots.length + (primary ? 1 : 0);
    if (!count) return `the default one on ${host}`;
    return `${count} ${count === 1 ? 'bot' : 'bots'} on ${host}`;
  }, [bots.length, host, primary]);

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'TEXTAREA') return;
        event.preventDefault();
        if (!canContinue || busy !== 'none') return;
        if (isLast) void handleFinish();
        else goTo(stepIndex + 1);
      }}
    >
      <aside className="onboarding-rail">
        <div className="onboarding-mark">
          <span className="onboarding-mark-face">
            <BloubSvg
              color="#8b5cf6"
              shape={MASCOT[step].shape}
              variant={MASCOT[step].variant}
            />
          </span>
          <span className="onboarding-mark-name">Hermes Bot</span>
        </div>

        <nav className="onboarding-steps" aria-label="Setup steps">
          {STEPS.map((entry, index) => {
            const state =
              index === stepIndex
                ? 'current'
                : index < stepIndex
                  ? 'done'
                  : 'ahead';
            return (
              <button
                key={entry.id}
                type="button"
                className={`onboarding-step is-${state}`}
                aria-current={state === 'current' ? 'step' : undefined}
                disabled={state === 'ahead'}
                onClick={() => goTo(index)}
              >
                <span className="onboarding-step-dot" aria-hidden="true">
                  {state === 'done' ? '✓' : index + 1}
                </span>
                <span className="onboarding-step-label">{entry.label}</span>
              </button>
            );
          })}
        </nav>

        <p className="onboarding-rail-note">
          The app draws the conversation.
          <br />
          Hermes decides what happens in it.
        </p>
      </aside>

      <div className="onboarding-main">
        <header className="onboarding-topbar">
          <span className="onboarding-count">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <div
            className="onboarding-progress"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={stepIndex + 1}
          >
            {STEPS.map((entry, index) => (
              <span
                key={entry.id}
                className={`onboarding-progress-segment ${
                  index < stepIndex ? 'is-done' : ''
                } ${index === stepIndex ? 'is-current' : ''}`}
              />
            ))}
          </div>
        </header>

        <div className="onboarding-stage">
          <div className="onboarding-card" key={step} data-direction={direction}>
            {step === 'welcome' ? (
              <>
                <p className="onboarding-eyebrow">Welcome</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  A window onto your agents.
                </h1>
                <p className="onboarding-lede">
                  Hermes Bot draws the conversations. Hermes runs them — the
                  models, the memory, the tools. Three things to set up, and the
                  door opens.
                </p>

                <ul className="onboarding-pitch">
                  <li className="onboarding-pitch-card">
                    <span className="onboarding-pitch-index">1</span>
                    <h2>The host</h2>
                    <p>
                      Where Hermes lives. Reached over SSH, the way you already
                      reach it — no port is opened on the server.
                    </p>
                  </li>
                  <li className="onboarding-pitch-card">
                    <span className="onboarding-pitch-index">2</span>
                    <h2>The key</h2>
                    <p>
                      The one secret. It goes into the macOS Keychain and stays
                      there, under the app&apos;s own name.
                    </p>
                  </li>
                  <li className="onboarding-pitch-card">
                    <span className="onboarding-pitch-index">3</span>
                    <h2>The crew</h2>
                    <p>
                      The bots that answer. They are already waiting on the
                      host; the app just gives them a face.
                    </p>
                  </li>
                </ul>
              </>
            ) : null}

            {step === 'host' ? (
              <>
                <p className="onboarding-eyebrow">The host</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  Where does Hermes run?
                </h1>
                <p className="onboarding-lede">
                  Hermes lives on a machine of yours. The app reaches it over
                  SSH, so the server never has to expose a port to the world.
                </p>

                <label className="onboarding-field">
                  <span className="onboarding-field-label">SSH host</span>
                  <input
                    type="text"
                    value={host}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="hermes-box.local"
                    onChange={(event) => {
                      setHost(event.target.value);
                      setError('');
                    }}
                  />
                  <span className="onboarding-field-note">
                    The name your SSH config already knows — the one you would
                    type after <code>ssh</code>.
                  </span>
                </label>

                <div className="onboarding-advanced">
                  <button
                    type="button"
                    className="onboarding-advanced-toggle"
                    aria-expanded={advanced}
                    onClick={() => setAdvanced((current) => !current)}
                  >
                    <span
                      className={`onboarding-chevron ${
                        advanced ? 'is-open' : ''
                      }`}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    Advanced
                  </button>
                  {advanced ? (
                    <div className="onboarding-advanced-body">
                      <div className="onboarding-field-row">
                        <label className="onboarding-field">
                          <span className="onboarding-field-label">
                            Remote API port
                          </span>
                          <input
                            type="number"
                            value={apiPort}
                            min={1}
                            max={65535}
                            spellCheck={false}
                            onChange={(event) => setApiPort(event.target.value)}
                          />
                        </label>
                        <label className="onboarding-field">
                          <span className="onboarding-field-label">
                            Local tunnel port
                          </span>
                          <input
                            type="number"
                            value={localPort}
                            min={1}
                            max={65535}
                            spellCheck={false}
                            onChange={(event) => setLocalPort(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="onboarding-command">
                        <span className="onboarding-field-label">
                          The command that will run
                        </span>
                        <code>{tunnelCommand}</code>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {step === 'key' ? (
              <>
                <p className="onboarding-eyebrow">The key</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  The key to the door.
                </h1>
                <p className="onboarding-lede">
                  Hermes checks one key before it answers. The app puts it in the
                  macOS Keychain and never writes it anywhere else.
                </p>

                <label className="onboarding-field">
                  <span className="onboarding-field-label">API key</span>
                  <input
                    type="password"
                    value={apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="API_SERVER_KEY"
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setError('');
                      setNotice('');
                    }}
                  />
                  <span className="onboarding-field-note">
                    It lives in <code>~/.hermes/.env</code> on the host, under
                    the name <code>API_SERVER_KEY</code>.
                  </span>
                </label>

                <div className="onboarding-field-actions">
                  <button
                    type="button"
                    className="onboarding-button is-quiet"
                    disabled={busy !== 'none' || !host.trim()}
                    onClick={() => void handleImport()}
                  >
                    {busy === 'import'
                      ? 'Reading…'
                      : `Read it from ${host || 'the host'}`}
                  </button>
                  {hasKey ? (
                    <span className="onboarding-stamp">In the Keychain</span>
                  ) : null}
                </div>
              </>
            ) : null}

            {step === 'connect' ? (
              <>
                <p className="onboarding-eyebrow">The handshake</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  Let&apos;s shake hands.
                </h1>
                <p className="onboarding-lede">
                  The app opens a tunnel to the host and asks the gateway who it
                  is. If the host answers, everything after this is just
                  talking.
                </p>

                <ul className="onboarding-checks">
                  {checks.map((check) => (
                    <li
                      key={check.id}
                      className={`onboarding-check is-${check.state}`}
                    >
                      <span
                        className="onboarding-check-dot"
                        aria-hidden="true"
                      />
                      <span className="onboarding-check-label">{check.label}</span>
                      <span className="onboarding-check-detail">
                        {check.detail ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>

                {error ? <p className="onboarding-error">{error}</p> : null}

                {error ? (
                  <button
                    type="button"
                    className="onboarding-button is-quiet"
                    disabled={busy !== 'none'}
                    onClick={() => void runHandshake()}
                  >
                    Try again
                  </button>
                ) : null}
              </>
            ) : null}

            {step === 'crew' ? (
              <>
                <p className="onboarding-eyebrow">Your crew</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  Who answers on the other side?
                </h1>
                <p className="onboarding-lede">
                  These are the bots Hermes serves on that host. The first one
                  is always there; the others are yours to make.
                </p>

                <ul className="onboarding-crew">
                  {primary ? (
                    <li className="onboarding-crew-item">
                      <AgentAvatar
                        avatar={{
                          color: avatarColor(primary.color, 'default'),
                          shape: botShape(primary.shape),
                        }}
                        size={36}
                        showBadge={false}
                      />
                      <span className="onboarding-crew-name">
                        {primary.title?.trim() || 'Chief of Staff'}
                      </span>
                      <span className="onboarding-crew-meta">the default bot</span>
                    </li>
                  ) : null}
                  {bots.map((bot) => (
                    <li key={bot.name} className="onboarding-crew-item">
                      <AgentAvatar
                        avatar={{
                          color: avatarColor(bot.color, bot.name),
                          shape: botShape(bot.shape),
                        }}
                        size={36}
                        showBadge={false}
                      />
                      <span className="onboarding-crew-name">
                        {bot.title?.trim() || bot.name}
                      </span>
                      <span className="onboarding-crew-meta">{bot.name}</span>
                    </li>
                  ))}
                  {!primary && !bots.length ? (
                    <li className="onboarding-crew-empty">
                      The host answered, but it serves no bot yet. The default
                      one is waiting for the gateway to name it.
                    </li>
                  ) : null}
                </ul>

                <div className="onboarding-maker">
                  <div className="onboarding-maker-head">
                    <h2>Make another bot</h2>
                    <p>
                      A bot is a Hermes profile on the host: its own key, its
                      own memory, its own face.
                    </p>
                  </div>

                  <label className="onboarding-field">
                    <span className="onboarding-field-label">Bot name</span>
                    <input
                      type="text"
                      value={botName}
                      maxLength={64}
                      spellCheck={false}
                      placeholder="e.g. Research assistant"
                      onChange={(event) => {
                        setBotName(event.target.value);
                        setError('');
                      }}
                    />
                  </label>

                  <div className="onboarding-maker-grid">
                    <div className="onboarding-maker-picker">
                      <span className="onboarding-field-label">Shape</span>
                      <ShapeGrid
                        value={botFace}
                        color={botColor}
                        onChange={setBotFace}
                      />
                    </div>
                    <div className="onboarding-maker-picker">
                      <span className="onboarding-field-label">Colour</span>
                      <ColorGrid
                        value={botColor}
                        onChange={(next) => {
                          setBotTouched(true);
                          setBotColor(next);
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="onboarding-button is-quiet"
                    disabled={busy !== 'none' || !botName.trim()}
                    onClick={() => void handleCreateBot()}
                  >
                    {busy === 'bot' ? 'Creating…' : 'Create the bot'}
                  </button>
                </div>
              </>
            ) : null}

            {step === 'ready' ? (
              <>
                <p className="onboarding-eyebrow">All set</p>
                <h1 id="onboarding-title" className="onboarding-title">
                  You&apos;re all set.
                </h1>
                <p className="onboarding-lede">
                  Everything Hermes needs is where it should be. The
                  conversation is yours — the app only draws it.
                </p>

                <dl className="onboarding-summary">
                  <div className="onboarding-summary-row">
                    <dt>Host</dt>
                    <dd>{host}</dd>
                  </div>
                  <div className="onboarding-summary-row">
                    <dt>Key</dt>
                    <dd>in the macOS Keychain</dd>
                  </div>
                  <div className="onboarding-summary-row">
                    <dt>Tunnel</dt>
                    <dd>127.0.0.1:{localPort}</dd>
                  </div>
                  <div className="onboarding-summary-row">
                    <dt>Bots</dt>
                    <dd>{crewSummary}</dd>
                  </div>
                </dl>

                <p className="onboarding-footnote">
                  The setup lives in the settings: run it again whenever you
                  move Hermes to another machine.
                </p>
              </>
            ) : null}

            {error && step !== 'connect' ? (
              <p className="onboarding-error">{error}</p>
            ) : null}
            {notice ? <p className="onboarding-notice">{notice}</p> : null}
          </div>
        </div>

        <footer className="onboarding-foot">
          <div className="onboarding-foot-left">
            {stepIndex === 0 ? (
              <button
                type="button"
                className="onboarding-button is-quiet"
                onClick={() => void handleDismiss()}
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                className="onboarding-button is-quiet"
                disabled={busy !== 'none'}
                onClick={() => goTo(stepIndex - 1)}
              >
                Back
              </button>
            )}
          </div>

          <div className="onboarding-foot-right">
            <button
              type="button"
              className="onboarding-button is-primary"
              disabled={!canContinue || busy !== 'none'}
              onClick={() => {
                if (isLast) void handleFinish();
                else goTo(stepIndex + 1);
              }}
            >
              {isLast
                ? 'Start talking'
                : step === 'welcome'
                  ? 'Set up Hermes Bot'
                  : 'Continue'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
