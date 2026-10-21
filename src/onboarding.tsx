import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HermesProfile, HermesStatus } from './hermes';
import { AgentAvatar } from './components/AgentAvatar';
import { botShape, BLOUB_COLOR_OPTIONS } from './components/Bloub';
import { ColorGrid, ShapeGrid } from './components/LogoControls';
import { StageBloub } from './components/StageBloub';
import { BLOUB_SHAPES, type BloubShape } from './components/bloubFrames';
import { toProfileId } from './components/CreateAgentDialog';
import { avatarColor, profileColor } from './profileColor';
import type { StateId } from './vendor/bloub/states';

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

/** The colours the actor wears. Every one of them is a colour Hermes has. */
const ACTOR_COLORS = BLOUB_COLOR_OPTIONS.map((color) => color.hex);

/** How long the actor keeps the same face before it changes its mind. */
const ACTOR_CHANGE_MS = 2000;

/** Something else from the pool — the actor never stays what it was. */
function another<T>(current: T, pool: readonly T[]): T {
  const others = pool.filter((item) => item !== current);
  return others[Math.floor(Math.random() * others.length)] ?? current;
}

const STEPS: StepId[] = [
  'welcome',
  'host',
  'key',
  'connect',
  'crew',
  'ready',
];

/**
 * A scene: what it says, and what the one that acts is doing while it says
 * it. The words are few on purpose — the person is reading, not studying.
 */
type Scene = {
  eyebrow: string;
  title: string;
  line: string;
  /** The shape of the actor: it glides into the next one. */
  shape: BloubShape;
  /** What it is doing. */
  state: StateId;
  /** How it feels about it. */
  expression: string;
};

const SCENES: Record<StepId, Scene> = {
  welcome: {
    eyebrow: 'Welcome',
    title: 'A window onto your agents.',
    line: 'Hermes runs them. The app draws them.',
    shape: 'nuage',
    state: 'idle',
    expression: 'curieux',
  },
  host: {
    eyebrow: 'The host',
    title: 'Where does Hermes run?',
    line: 'The name your SSH already knows.',
    shape: 'galet',
    state: 'idle',
    expression: 'attentif',
  },
  key: {
    eyebrow: 'The key',
    title: 'The key to the door.',
    line: 'It stays in the Keychain, and nowhere else.',
    shape: 'goutte',
    state: 'idle',
    expression: 'attentif',
  },
  connect: {
    eyebrow: 'The handshake',
    title: "Let's shake hands.",
    line: 'The app opens a tunnel and says hello.',
    shape: 'squircle',
    state: 'thinking',
    expression: 'neutre',
  },
  crew: {
    eyebrow: 'Your crew',
    title: 'Who answers?',
    line: 'The bots Hermes serves on that host.',
    shape: 'capsule',
    state: 'idle',
    expression: 'heureux',
  },
  ready: {
    eyebrow: 'All set',
    title: "You're all set.",
    line: 'Hermes is reachable. The rest is talking.',
    shape: 'hexagone',
    state: 'idle',
    expression: 'hilare',
  },
};

const DEFAULT_COLOR = '#5b5bda';

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
  const [failed, setFailed] = useState(false);
  const [bots, setBots] = useState<HermesProfile[]>([]);
  const [primary, setPrimary] = useState<HermesProfile | undefined>(undefined);
  const [botName, setBotName] = useState('');
  const [botFace, setBotFace] = useState<BloubShape>('cercle');
  const [botColor, setBotColor] = useState(DEFAULT_COLOR);
  const [botTouched, setBotTouched] = useState(false);
  // The actor changes its mind every couple of seconds: another colour,
  // another shape. The window takes the colour of the actor with it.
  const [actorColor, setActorColor] = useState('#8b5cf6');
  const [actorShape, setActorShape] = useState<BloubShape>('nuage');

  const step = STEPS[stepIndex];
  const scene = SCENES[step];

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

  // The actor does not stay what it was: on the first page it changes every
  // two seconds, and the light of the window changes with it.
  useEffect(() => {
    if (step !== 'welcome') return;
    const timer = window.setInterval(() => {
      setActorColor((current) => another(current, ACTOR_COLORS));
      setActorShape((current) => another(current, BLOUB_SHAPES));
    }, ACTOR_CHANGE_MS);
    return () => window.clearInterval(timer);
  }, [step]);

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
    setFailed(false);
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
      setFailed(true);
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
      setFailed(true);
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
      setFailed(true);
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
      setNotice(`Read from ${host}, and kept in the Keychain.`);
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
    if (!count) return 'the default one';
    return `${count} ${count === 1 ? 'bot' : 'bots'}`;
  }, [bots.length, primary]);

  // The actor reacts to what happens: it thinks while the tunnel opens, and
  // it celebrates when the host answers.
  const actor = useMemo(() => {
    if (step === 'welcome') return { ...scene, shape: actorShape };
    if (step !== 'connect') return scene;
    if (failed) return { ...scene, state: 'alert' as StateId, expression: 'neutre' };
    if (connected) return { ...scene, state: 'wide' as StateId, expression: 'heureux' };
    return scene;
  }, [actorShape, connected, failed, scene, step]);

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{ '--actor-color': actorColor } as React.CSSProperties}
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
      <div className="onboarding-sky" aria-hidden="true">
        <span className="onboarding-glow is-violet" />
        <span className="onboarding-glow is-teal" />
        <span className="onboarding-glow is-rose" />
      </div>

      <span className="onboarding-timeline" aria-hidden="true">
        <span
          className="onboarding-timeline-fill"
          style={{
            width: `${((stepIndex + (canContinue ? 0.5 : 0)) / STEPS.length) * 100}%`,
          }}
        />
      </span>

      <header className="onboarding-bar">
        <span className="onboarding-brand">Hermes Bot</span>
        <span className="onboarding-count">
          {stepIndex + 1} <i>/</i> {STEPS.length}
        </span>
      </header>

      <main className="onboarding-stage">
        <div className="onboarding-scene" key={step} data-direction={direction}>
          <div className="onboarding-actor">
            <span className="onboarding-halo" aria-hidden="true" />
            <StageBloub
              color={actorColor}
              shape={actor.shape}
              state={actor.state}
              expression={actor.expression}
              size={196}
            />
          </div>

          <p className="onboarding-eyebrow">{scene.eyebrow}</p>
          <h1 id="onboarding-title" className="onboarding-title">
            {scene.title}
          </h1>
          <p className="onboarding-line">{scene.line}</p>

          {step === 'welcome' ? (
            <ul className="onboarding-marks">
              {(['host', 'key', 'crew'] as StepId[]).map((entry, index) => (
                <li key={entry} className="onboarding-mark">
                  <span className="onboarding-mark-index">{index + 1}</span>
                  {SCENES[entry].eyebrow}
                </li>
              ))}
            </ul>
          ) : null}

          {step === 'host' ? (
            <>
              <div className="onboarding-field">
                <label
                  className="onboarding-field-label"
                  htmlFor="setup-host"
                >
                  SSH host
                </label>
                <input
                  id="setup-host"
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
              </div>

              <button
                type="button"
                className="onboarding-link"
                aria-expanded={advanced}
                onClick={() => setAdvanced((current) => !current)}
              >
                {advanced ? 'Hide the ports' : 'The ports, if they are not the usual ones'}
              </button>

              {advanced ? (
                <div className="onboarding-advanced">
                  <div className="onboarding-field-row">
                    <div className="onboarding-field">
                      <label
                        className="onboarding-field-label"
                        htmlFor="setup-api-port"
                      >
                        Remote API port
                      </label>
                      <input
                        id="setup-api-port"
                        type="number"
                        value={apiPort}
                        min={1}
                        max={65535}
                        spellCheck={false}
                        onChange={(event) => setApiPort(event.target.value)}
                      />
                    </div>
                    <div className="onboarding-field">
                      <label
                        className="onboarding-field-label"
                        htmlFor="setup-local-port"
                      >
                        Local tunnel port
                      </label>
                      <input
                        id="setup-local-port"
                        type="number"
                        value={localPort}
                        min={1}
                        max={65535}
                        spellCheck={false}
                        onChange={(event) => setLocalPort(event.target.value)}
                      />
                    </div>
                  </div>
                  <code className="onboarding-command">{tunnelCommand}</code>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 'key' ? (
            <>
              <div className="onboarding-field">
                <label
                  className="onboarding-field-label"
                  htmlFor="setup-key"
                >
                  API key
                </label>
                <input
                  id="setup-key"
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
              </div>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-button is-quiet"
                  disabled={busy !== 'none' || !host.trim()}
                  onClick={() => void handleImport()}
                >
                  {busy === 'import' ? 'Reading…' : `Read it from ${host}`}
                </button>
                {hasKey ? (
                  <span className="onboarding-stamp">In the Keychain</span>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 'connect' ? (
            <>
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

              {error ? (
                <div className="onboarding-actions">
                  <span className="onboarding-error">{error}</span>
                  <button
                    type="button"
                    className="onboarding-button is-quiet"
                    disabled={busy !== 'none'}
                    onClick={() => void runHandshake()}
                  >
                    Try again
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 'crew' ? (
            <>
              <ul className="onboarding-crew">
                {primary ? (
                  <li className="onboarding-crew-item">
                    <AgentAvatar
                      avatar={{
                        color: avatarColor(primary.color, 'default'),
                        shape: botShape(primary.shape),
                      }}
                      size={44}
                      showBadge={false}
                    />
                    <span className="onboarding-crew-name">
                      {primary.title?.trim() || 'Chief of Staff'}
                    </span>
                  </li>
                ) : null}
                {bots.map((bot) => (
                  <li key={bot.name} className="onboarding-crew-item">
                    <AgentAvatar
                      avatar={{
                        color: avatarColor(bot.color, bot.name),
                        shape: botShape(bot.shape),
                      }}
                      size={44}
                      showBadge={false}
                    />
                    <span className="onboarding-crew-name">
                      {bot.title?.trim() || bot.name}
                    </span>
                  </li>
                ))}
                {!primary && !bots.length ? (
                  <li className="onboarding-crew-empty">
                    The host answered, but it serves no bot yet.
                  </li>
                ) : null}
              </ul>

              <details className="onboarding-maker">
                <summary>Make another bot</summary>
                <div className="onboarding-field">
                  <label
                    className="onboarding-field-label"
                    htmlFor="setup-bot-name"
                  >
                    Bot name
                  </label>
                  <input
                    id="setup-bot-name"
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
                </div>

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
              </details>
            </>
          ) : null}

          {step === 'ready' ? (
            <ul className="onboarding-facts">
              <li>
                <span>Host</span>
                <strong>{host}</strong>
              </li>
              <li>
                <span>Key</span>
                <strong>in the Keychain</strong>
              </li>
              <li>
                <span>Crew</span>
                <strong>{crewSummary}</strong>
              </li>
            </ul>
          ) : null}

          {error && step !== 'connect' ? (
            <p className="onboarding-error is-alone">{error}</p>
          ) : null}
          {notice ? <p className="onboarding-notice">{notice}</p> : null}
        </div>
      </main>

      <footer className="onboarding-foot">
        <div className="onboarding-foot-left">
          {stepIndex === 0 ? (
            <button
              type="button"
              className="onboarding-button is-quiet"
              onClick={() => void handleDismiss()}
            >
              Skip
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

        <nav className="onboarding-dots" aria-label="Setup steps">
          {STEPS.map((entry, index) => (
            <button
              key={entry}
              type="button"
              className={`onboarding-dot ${
                index === stepIndex ? 'is-current' : ''
              } ${index < stepIndex ? 'is-done' : ''}`}
              aria-label={SCENES[entry].eyebrow}
              aria-current={index === stepIndex ? 'step' : undefined}
              disabled={index > stepIndex}
              onClick={() => goTo(index)}
            />
          ))}
        </nav>

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
                ? 'Begin'
                : 'Continue'}
          </button>
        </div>
      </footer>
    </div>
  );
}
