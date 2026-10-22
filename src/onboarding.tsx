import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HermesConnectionMode, HermesStatus } from './hermes';
import { AgentAvatar } from './components/AgentAvatar';
import { BLOUB_COLOR_OPTIONS } from './components/Bloub';
import { ColorGrid, ShapeGrid } from './components/LogoControls';
import { StageBloub } from './components/StageBloub';
import { BLOUB_SHAPES, type BloubShape } from './components/bloubFrames';
import { toProfileId } from './components/CreateAgentDialog';
import { avatarColor, profileColor } from './profileColor';
import type { StateId } from './vendor/bloub/states';

/**
 * The setup: the door the person walks through the first time the app opens.
 *
 * Four scenes. The welcome, the connection, the first bot, and the door that
 * opens. The connection is one page: where Hermes lives, the key that opens
 * it, and the handshake that says whether the two of them are talking.
 *
 * Nothing here is kept by the app but the answer to "has this been done".
 * The connection goes to the app's own record, the key to the Keychain, and
 * the bots stay where they are: on the host.
 */

type StepId = 'welcome' | 'setup' | 'name' | 'face' | 'colour' | 'ready';

const STEPS: StepId[] = [
  'welcome',
  'setup',
  'name',
  'face',
  'colour',
  'ready',
];

/** The colours the actor wears. Every one of them is a colour Hermes has. */
const ACTOR_COLORS = BLOUB_COLOR_OPTIONS.map((color) => color.hex);

/** How long the actor keeps the same face before it changes its mind. */
const ACTOR_CHANGE_MS = 2000;

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
  setup: {
    eyebrow: 'The setup',
    title: 'Connect your Hermes.',
    line: 'Where it lives, and the key that opens it.',
    shape: 'galet',
    state: 'idle',
    expression: 'attentif',
  },
  name: {
    eyebrow: 'Your first bot',
    title: 'What is it called?',
    line: 'The name you will call it by.',
    shape: 'goutte',
    state: 'idle',
    expression: 'attentif',
  },
  face: {
    eyebrow: 'Its face',
    title: 'What shape?',
    line: 'The face it wears, everywhere it shows up.',
    shape: 'galet',
    state: 'idle',
    expression: 'curieux',
  },
  colour: {
    eyebrow: 'Its colour',
    title: 'What colour?',
    line: 'Hermes keeps it, and the app paints it with it.',
    shape: 'squircle',
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

/** The violet the app wears, and the colour a bot starts from. */
const DEFAULT_COLOR = '#5b5bda';

/** Something else from the pool — the actor never stays what it was. */
function another<T>(current: T, pool: readonly T[]): T {
  const others = pool.filter((item) => item !== current);
  return others[Math.floor(Math.random() * others.length)] ?? current;
}

type CheckState = 'waiting' | 'working' | 'done' | 'failed';

type Check = {
  id: string;
  state: CheckState;
  detail?: string;
};

/** The three things a connection has to prove, in the order they happen. */
const CHECK_IDS = ['reach', 'key', 'link'] as const;

/**
 * What each check is called, in each of the two connections. A Hermes on
 * this machine is not reached through a tunnel: it is simply there.
 */
const CHECK_LABELS: Record<HermesConnectionMode, Record<string, string>> = {
  local: {
    reach: 'Hermes is running',
    key: 'The key is accepted',
    link: 'The app is connected',
  },
  ssh: {
    reach: 'The host answers',
    key: 'The key is accepted',
    link: 'The tunnel is open',
  },
};

function emptyChecks(): Check[] {
  return CHECK_IDS.map((id) => ({ id, state: 'waiting' as CheckState }));
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

/** The bot the person made first: it is the one the last scene shows. */
type MadeBot = {
  name: string;
  title: string;
  color: string;
  shape: BloubShape;
};

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
  // Where Hermes runs: on this machine, or on another one over SSH.
  const [mode, setMode] = useState<HermesConnectionMode>('local');
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
  const [madeBot, setMadeBot] = useState<MadeBot | null>(null);
  const [botName, setBotName] = useState('');
  const [botFace, setBotFace] = useState<BloubShape>('cercle');
  const [botColor, setBotColor] = useState(DEFAULT_COLOR);
  const [botTouched, setBotTouched] = useState(false);
  // The actor changes its mind every couple of seconds: another colour,
  // another shape. The window takes the colour of the actor with it.
  const [actorColor, setActorColor] = useState(DEFAULT_COLOR);
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
        setMode(settings.mode ?? 'local');
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
        mode,
        sshHost: mode === 'ssh' ? host : undefined,
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
    setChecks((current) => markCheck(current, 'link', 'working'));

    // The key and the host are written down now: the link that follows is
    // the one the app will use from here on.
    const saved = await bridge
      ?.saveSettings?.({
        mode,
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
      setChecks((current) => markCheck(current, 'link', 'failed'));
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
      setChecks((current) => markCheck(current, 'link', 'failed'));
      setError(status?.message ?? 'The tunnel did not open.');
      setFailed(true);
      setBusy('none');
      return;
    }

    setChecks((current) =>
      markCheck(
        current,
        'link',
        'done',
        mode === 'local' ? `127.0.0.1:${apiPort || '8642'}` : `127.0.0.1:${localPort}`,
      ),
    );
    setConnected(true);
    setBusy('none');
  }, [apiKey, apiPort, bridge, host, localPort, mode]);

  async function handleImport() {
    if (!bridge?.importKey) return;
    setBusy('import');
    setError('');
    setNotice('');
    const result = await bridge
      .importKey({ mode, sshHost: host })
      .catch((reason: Error) => ({ ok: false, error: reason.message }));
    if (result.ok) {
      setHasKey(true);
      setApiKey('');
      setNotice(
        mode === 'local'
          ? 'Read from this Mac, and kept in the Keychain.'
          : `Read from ${host}, and kept in the Keychain.`,
      );
    } else {
      setError(result.error ?? 'The key could not be read from the server.');
    }
    setBusy('none');
  }

  async function handleCreateBot(input: {
    shape: BloubShape;
    /** The colour the person chose; absent when they chose none. */
    color?: string;
  }): Promise<boolean> {
    if (!bridge?.createBot) return false;
    const title = botName.trim();
    if (!title) return false;
    setBusy('bot');
    setError('');
    setNotice('');
    const result = await bridge
      .createBot({
        name: toProfileId(title),
        title,
        color: input.color,
        shape: input.shape,
        description: 'Bot created from the Hermes Bot setup',
      })
      .catch((reason: Error) => ({
        ok: false,
        error: reason.message,
        name: undefined,
        title: undefined,
        color: undefined,
      }));
    if (!result.ok) {
      setError(result.error ?? 'The bot could not be created.');
      setBusy('none');
      return false;
    }
    const name = result.name || toProfileId(title);
    setMadeBot({
      name,
      title: result.title?.trim() || title,
      color: avatarColor(result.color, name),
      // The shape that was asked for, not the one the state happens to hold:
      // the page shows the bot that was made.
      shape: input.shape,
    });
    setBotName('');
    setBotTouched(false);
    setBusy('none');
    return true;
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

  // A host is only needed for a Hermes that runs somewhere else: on this
  // machine, the port is enough.
  const canTest =
    (mode === 'local' || host.trim() !== '') &&
    (hasKey || apiKey.trim() !== '');
  const canContinue = useMemo(() => {
    switch (step) {
      case 'setup':
        return connected;
      case 'name':
        // The bot is not the point of the setup: the person can leave it
        // alone and talk to the default bot instead.
        return botName.trim() !== '' || madeBot !== null;
      case 'colour':
        return botName.trim() !== '' || madeBot !== null;
      default:
        return true;
    }
  }, [botName, connected, madeBot, step]);

  const isLast = stepIndex === STEPS.length - 1;
  const testing = step === 'setup' && !connected;
  // The pages that pick a shape or a colour advance on the click itself:
  // there is nothing left for a button to say.
  const picksItsOwnWay = step === 'face' || step === 'colour';
  // The line that says how the app will reach Hermes. A Hermes on this
  // machine needs no tunnel: the port is the way in.
  const linkLine =
    mode === 'local'
      ? `127.0.0.1:${apiPort || '8642'} — no tunnel, no SSH.`
      : `ssh -N -L 127.0.0.1:${
          localPort || '18742'
        }:127.0.0.1:${apiPort || '8642'} ${host || '<host>'}`;

  // The actor reacts to what happens: it thinks while the tunnel opens, and
  // it celebrates when the host answers.
  const actor = useMemo(() => {
    // The actor is the bot while the bot is being made: it takes the shape
    // that is being picked, and the colour that is being picked.
    const base =
      step === 'welcome'
        ? { ...scene, shape: actorShape }
        : step === 'face' || step === 'colour'
          ? { ...scene, shape: botFace }
          : scene;
    if (step !== 'setup') return base;
    if (failed) return { ...base, state: 'alert' as StateId };
    if (connected) return { ...base, state: 'wide' as StateId };
    if (busy === 'handshake') return { ...base, state: 'thinking' as StateId };
    return base;
  }, [actorShape, botFace, busy, connected, failed, scene, step]);

  // The light of the window follows the actor, and the last scene follows the
  // bot the person made.
  const light =
    step === 'ready'
      ? (madeBot?.color ?? actorColor)
      : step === 'colour'
        ? botColor
        : actorColor;

  const primaryLabel = isLast
    ? 'Start talking'
    : step === 'welcome'
      ? 'Begin'
      : testing
        ? 'Test the connection'
        : step === 'colour' && !madeBot
          ? 'Make the bot'
          : 'Continue';

  async function makeBot(input: {
    shape: BloubShape;
    color?: string;
  }): Promise<boolean> {
    const made = await handleCreateBot(input);
    if (!made) return false;
    goTo(stepIndex + 1);
    return true;
  }

  async function handlePrimary() {
    if (isLast) {
      await handleFinish();
      return;
    }
    if (testing) {
      await runHandshake();
      return;
    }
    if (step === 'face') {
      goTo(stepIndex + 1);
      return;
    }
    if (step === 'colour' && !madeBot) {
      // The bot is made on the way out: the person sees it appear on the
      // last page, not a form that says it was made.
      await makeBot({
        shape: botFace,
        color: botTouched ? botColor : undefined,
      });
      return;
    }
    goTo(stepIndex + 1);
  }

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{ '--actor-color': light } as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'TEXTAREA') return;
        event.preventDefault();
        if (busy !== 'none') return;
        if (testing && !canTest) return;
        if (!testing && !canContinue && !picksItsOwnWay) return;
        void handlePrimary();
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
          {step === 'ready' && madeBot ? (
            <div className="onboarding-actor">
              <span className="onboarding-halo" aria-hidden="true" />
              <AgentAvatar
                avatar={{ color: madeBot.color, shape: madeBot.shape }}
                size={120}
                showBadge={false}
              />
            </div>
          ) : (
            <div className="onboarding-actor">
              <span className="onboarding-halo" aria-hidden="true" />
              <StageBloub
                color={light}
                shape={actor.shape}
                state={actor.state}
                expression={actor.expression}
                size={196}
              />
            </div>
          )}

          <p className="onboarding-eyebrow">{scene.eyebrow}</p>
          <h1 id="onboarding-title" className="onboarding-title">
            {scene.title}
          </h1>
          <p className="onboarding-line">{scene.line}</p>

          {step === 'setup' ? (
            <>
              <fieldset className="onboarding-modes">
                <legend className="onboarding-field-label">
                  Where does Hermes run?
                </legend>
                <label className="onboarding-mode">
                  <input
                    type="radio"
                    name="hermes-mode"
                    value="local"
                    checked={mode === 'local'}
                    onChange={() => {
                      setMode('local');
                      setError('');
                    }}
                  />
                  <span className="onboarding-mode-copy">
                    <strong>This Mac</strong>
                    <em>Hermes runs on this machine. No tunnel, no SSH.</em>
                  </span>
                </label>
                <label className="onboarding-mode">
                  <input
                    type="radio"
                    name="hermes-mode"
                    value="ssh"
                    checked={mode === 'ssh'}
                    onChange={() => {
                      setMode('ssh');
                      setError('');
                    }}
                  />
                  <span className="onboarding-mode-copy">
                    <strong>Another machine</strong>
                    <em>
                      Hermes runs elsewhere, and the app reaches it over SSH.
                    </em>
                  </span>
                </label>
              </fieldset>

              {mode === 'ssh' ? (
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
              ) : null}

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
                  disabled={
                    busy !== 'none' || (mode === 'ssh' && !host.trim())
                  }
                  onClick={() => void handleImport()}
                >
                  {busy === 'import'
                    ? 'Reading…'
                    : mode === 'local'
                      ? 'Read it from this Mac'
                      : `Read it from ${host}`}
                </button>
                {hasKey ? (
                  <span className="onboarding-stamp">In the Keychain</span>
                ) : null}
              </div>

              <button
                type="button"
                className="onboarding-link"
                aria-expanded={advanced}
                onClick={() => setAdvanced((current) => !current)}
              >
                {advanced
                  ? 'Hide the ports'
                  : 'The ports, if they are not the usual ones'}
              </button>

              {advanced ? (
                <div className="onboarding-advanced">
                  <div className="onboarding-field-row">
                    <div className="onboarding-field">
                      <label
                        className="onboarding-field-label"
                        htmlFor="setup-api-port"
                      >
                        {mode === 'local' ? 'API port' : 'Remote API port'}
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
                    {mode === 'ssh' ? (
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
                    ) : null}
                  </div>
                  <code className="onboarding-command">{linkLine}</code>
                </div>
              ) : null}

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
                    <span className="onboarding-check-label">
                      {CHECK_LABELS[mode][check.id] ?? check.id}
                    </span>
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

          {step === 'name' ? (
            <>
              <div className="onboarding-field is-centred">
                <label
                  className="onboarding-field-label"
                  htmlFor="setup-bot-name"
                >
                  Its name
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
              <button
                type="button"
                className="onboarding-link"
                onClick={() => goTo(STEPS.length - 1)}
              >
                Not now
              </button>
            </>
          ) : null}

          {step === 'face' ? (
            <div className="onboarding-picker">
              <ShapeGrid
                value={botFace}
                color={botColor}
                onChange={(shape) => {
                  // A click is the way forward: the person chose, the page
                  // gets out of the way.
                  setBotFace(shape);
                  goTo(stepIndex + 1);
                }}
              />
            </div>
          ) : null}

          {step === 'colour' ? (
            <div className="onboarding-picker">
              <ColorGrid
                value={botColor}
                onChange={(next) => {
                  setBotTouched(true);
                  setBotColor(next);
                  // The colour is the last thing to choose, so the bot is
                  // made right here: one click, and the door opens.
                  void makeBot({ shape: botFace, color: next });
                }}
              />
            </div>
          ) : null}

          {step === 'ready' ? (
            <ul className="onboarding-facts">
              <li>
                <span>Hermes runs</span>
                <strong>{mode === 'local' ? 'on this Mac' : `on ${host}`}</strong>
              </li>
              <li>
                <span>Key</span>
                <strong>in the Keychain</strong>
              </li>
              {madeBot ? (
                <li>
                  <span>First bot</span>
                  <strong>{madeBot.title}</strong>
                </li>
              ) : null}
            </ul>
          ) : null}

          {error && step !== 'setup' ? (
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
          {picksItsOwnWay ? null : (
            <button
              type="button"
              className="onboarding-button is-primary"
              disabled={busy !== 'none' || (testing ? !canTest : !canContinue)}
              onClick={() => void handlePrimary()}
            >
              {busy === 'handshake' ? 'Connecting…' : primaryLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
