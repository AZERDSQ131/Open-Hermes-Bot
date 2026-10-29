import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HermesBridge, HermesConnectionMode, HermesStatus } from './hermes';
import { BLOUB_COLOR_OPTIONS } from './components/Bloub';
import { ColorGrid, ShapeGrid } from './components/LogoControls';
import { MoodBloub } from './components/MoodBloub';
import { BLOUB_SHAPES, type BloubShape } from './components/bloubFrames';
import { toProfileId } from './components/CreateAgentDialog';
import { avatarColor, profileColor } from './profileColor';
import type { MoodId } from './moods';
import { describeFailure, keyFailureHelp, type Help } from './setupHelp';
import { SetupHelp } from './components/SetupHelp';

/** What a read of the key answers, whether the bridge answered or threw. */
type ImportedKey = Awaited<ReturnType<HermesBridge['importKey']>>;

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
};

const SCENES: Record<StepId, Scene> = {
  welcome: {
    eyebrow: 'Welcome',
    title: 'A window onto your agents.',
    line: 'Hermes runs them. The app draws them.',
    shape: 'nuage',
  },
  setup: {
    eyebrow: 'The setup',
    title: 'Connect your Hermes.',
    line: 'Where it lives, and the key that opens it.',
    shape: 'galet',
  },
  name: {
    eyebrow: 'Your first bot',
    title: 'What is it called?',
    line: 'The name you will call it by.',
    shape: 'goutte',
  },
  face: {
    eyebrow: 'Its face',
    title: 'What shape?',
    line: 'The face it wears, everywhere it shows up.',
    shape: 'galet',
  },
  colour: {
    eyebrow: 'Its colour',
    title: 'What colour?',
    line: 'Hermes keeps it, and the app paints it with it.',
    shape: 'squircle',
  },
  ready: {
    eyebrow: 'All set',
    title: "You're all set.",
    line: 'Hermes is reachable. The rest is talking.',
    shape: 'hexagone',
  },
};

/** The blue the app wears, and the colour a bot starts from. */
const DEFAULT_COLOR = '#3f6fd1';

/** Something else from the pool — the actor never stays what it was. */
function another<T>(current: T, pool: readonly T[]): T {
  const others = pool.filter((item) => item !== current);
  return others[Math.floor(Math.random() * others.length)] ?? current;
}

/**
 * What the person is told when nothing answers on this Mac: where the scan
 * looked, and the question to ask themselves.
 */
function scanSilence(message: string | undefined, port: string) {
  const nothing =
    message === 'Nothing is listening on that port' ||
    message === 'No answer on the local port';
  return nothing
    ? `No Hermes answered on 127.0.0.1:${port}. Is it running?`
    : (message ?? 'The host did not answer.');
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
  /**
   * The setup is done: the app takes over. The bot the person made travels
   * with it, so the sidebar can carry it until the server lists it.
   */
  onFinish: (bot?: OnboardingBot) => void;
  /** The person walked away from the setup. */
  onDismiss: () => void;
};

/** The bot the setup made, as the app needs to know it. */
export type OnboardingBot = {
  /** The profile id on the host: the name Hermes knows the bot by. */
  name: string;
  title: string;
  color: string;
  shape: BloubShape;
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
  // A repair that already failed is not offered again: the message says what
  // went wrong, and pressing the same button would ask the same question.
  const [openApiFailed, setOpenApiFailed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<'none' | 'import' | 'handshake' | 'bot' | 'open-api'>(
    'none',
  );
  const [error, setError] = useState('');
  // The same failure, said with what to do about it: the pages of the two
  // connections show this one instead of the bare message when they have it.
  const [help, setHelp] = useState<Help | null>(null);
  const [notice, setNotice] = useState('');
  /** A notice is good news by default; this one is only worth knowing. */
  const [noticeWarn, setNoticeWarn] = useState(false);
  // The bot that was made and is not served by the gateway yet: the shell says
  // when it is, and the page has something to say about it then.
  const warmingBot = useRef('');
  // Where the bot stands with the gateway: still coming, served, or never.
  const [warming, setWarming] = useState<'none' | 'pending' | 'ready' | 'failed'>(
    'none',
  );
  const [checks, setChecks] = useState<Check[]>(emptyChecks);
  const [connected, setConnected] = useState(false);
  const [failed, setFailed] = useState(false);
  // The scan of this Mac runs itself once: the person chose it, and nothing
  // more should be asked of them than that.
  const [scanned, setScanned] = useState(false);
  // The machines the person has already named in their SSH config: read
  // when a Hermes elsewhere is being connected to, and only then.
  const [savedHosts, setSavedHosts] = useState<string[] | null>(null);
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
      setHelp(null);
      setNotice('');
    },
    [stepIndex],
  );

  const runHandshake = useCallback(
    async ({
      mode: forMode,
      host: forHost,
      apiKey: forKey,
    }: {
      mode?: HermesConnectionMode;
      host?: string;
      apiKey?: string;
    } = {}) => {
      if (!bridge?.test) return;
      const at = forMode ?? mode;
      const where = forHost ?? host;
      const key = (forKey ?? apiKey).trim();
      const port = Number.parseInt(apiPort, 10) || 8642;
      setBusy('handshake');
      setError('');
      setHelp(null);
      setFailed(false);
      setChecks(emptyChecks());
      setChecks((current) => markCheck(current, 'reach', 'working'));

      let result: HermesStatus;
      try {
        result = await bridge.test({
          mode: at,
          sshHost: at === 'ssh' ? where : undefined,
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
        setError(
          at === 'local'
            ? scanSilence(result.message, String(apiPort || '8642'))
            : (result.message ?? 'The host did not answer.'),
        );
        // A key in hand and nothing on the port is the API server being off:
        // that has an answer, and the page gives it.
        setHelp(
          result.reason === 'api-server-off'
            ? describeFailure({
                kind: 'port',
                mode: at,
                host: at === 'ssh' ? where : '',
                port: String(port),
              })
            : null,
        );
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
          mode: at,
          sshHost: where,
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
          at === 'local'
            ? `127.0.0.1:${apiPort || '8642'}`
            : `127.0.0.1:${localPort}`,
        ),
      );
      setConnected(true);
      setBusy('none');
    },
    [apiKey, apiPort, bridge, host, localPort, mode],
  );

  /**
   * Reads the key from the machine that runs Hermes, in the mode given. The
   * scan and the saved-host handshake both need it done for them; the
   * button hands it over too.
   */
  const importFor = useCallback(
    async (at: HermesConnectionMode, where: string): Promise<boolean> => {
      if (!bridge?.importKey) return false;
      const result = await bridge
        .importKey({ mode: at, sshHost: where })
        .catch((failure: Error): ImportedKey => ({
          ok: false,
          error: failure.message,
        }));
      if (result.ok) {
        setHasKey(true);
        setOpenApiFailed(false);
        setApiKey('');
        setNoticeWarn(false);
        setNotice(
          at === 'local'
            ? 'Read from this Mac, and kept in the Keychain.'
            : `Read from ${where}, and kept in the Keychain.`,
        );
        return true;
      }
      setError(result.error ?? 'The key could not be read from the server.');
      // The read knows which nothing it found: the page turns that into the
      // two lines that make a key, instead of repeating the shell.
      setHelp(
        keyFailureHelp(
          result.reason,
          at,
          at === 'ssh' ? where : '',
          result.details,
        ),
      );
      return false;
    },
    [bridge],
  );

  async function handleImport() {
    if (busy !== 'none') return;
    setBusy('import');
    await importFor(mode, host);
    setBusy('none');
  }

  /**
   * A Hermes on this machine: the scan reads the key where it lives if none
   * is known yet, then the handshake opens the connection. One ask, and no
   * form to fill in first.
   */
  const scanLocal = useCallback(async () => {
    if (!bridge?.test || busy !== 'none') return;
    if (!hasKey && !apiKey.trim()) {
      const imported = await importFor('local', '');
      if (!imported) return;
    }
    await runHandshake({ mode: 'local' });
  }, [apiKey, bridge, busy, hasKey, importFor, runHandshake]);

  /**
   * Hermes' API server stays off until a key exists for it, and a fresh
   * install has none: nothing to paste, nothing to try. The shell asks Hermes
   * to make one where it belongs, the gateway picks it up, and the setup
   * walks the path it always walked. The key comes back through the read the
   * setup already uses, never through this window.
   */
  const openApi = useCallback(async () => {
    if (!bridge?.openApiServer || busy !== 'none') return;
    setBusy('open-api');
    setError('');
    try {
      const opened = await bridge.openApiServer({
        mode,
        sshHost: mode === 'ssh' ? host : undefined,
      });
      if (!opened.ok) {
        setOpenApiFailed(true);
        // The repair's own words replace the block that sent the person here:
        // that block is about a key that is missing, and this is the answer
        // to pressing the button that was meant to make one.
        setHelp(null);
        setError(opened.error ?? 'The key could not be written on the host.');
        setBusy('none');
        return;
      }
      setHasKey(true);
      setHelp(null);
      setOpenApiFailed(false);
      setBusy('none');
      await runHandshake({ mode, host });
    } catch (reason) {
      setOpenApiFailed(true);
      setHelp(null);
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : 'The key could not be written on the host.',
      );
      setBusy('none');
    }
  }, [bridge, busy, host, mode, runHandshake]);

  /**
   * A saved host is one click. The host is named, the key is read from the
   * machine itself — or the person is asked for it — and the connection
   * opens on its own. What used to be three fields and a button.
   */
  const pickSavedHost = useCallback(
    async (name: string) => {
      if (busy !== 'none') return;
      setHost(name);
      setError('');
      setHelp(null);
      setNotice('');
      if (!hasKey && !apiKey.trim()) {
        const imported = await importFor('ssh', name);
        if (!imported) return;
      }
      await runHandshake({ mode: 'ssh', host: name });
    },
    [apiKey, busy, hasKey, importFor, runHandshake],
  );

  // The scan is what being asked for this Mac costs: nothing. Once the
  // connection page is on this Mac, the app looks at the port, reads the
  // key where it lives, and says what it found.
  useEffect(() => {
    if (step !== 'setup' || mode !== 'local') return;
    if (connected || busy !== 'none' || scanned) return;
    setScanned(true);
    void scanLocal();
  }, [busy, connected, mode, scanLocal, scanned, step]);

  // The names in the SSH config are read once the person is looking at a
  // Hermes that runs elsewhere: the list is there to be chosen from, not
  // to be fetched for its own sake.
  useEffect(() => {
    if (step !== 'setup' || mode !== 'ssh' || savedHosts !== null) return;
    let cancelled = false;
    const fallback = { hosts: [] as string[] };
    Promise.resolve(bridge?.sshHosts ? bridge.sshHosts() : fallback)
      .then((result) => {
        if (cancelled) return;
        setSavedHosts(Array.isArray(result.hosts) ? result.hosts : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSavedHosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, mode, savedHosts, step]);

  // The gateway serves a bot that was just made a moment later — or not, and
  // the page then says which of the two it is. The bot is made either way;
  // this is the answer to "is it there yet".
  useEffect(() => {
    const listener = window.hermes;
    if (!listener?.onBotReady) return;
    return listener.onBotReady((event) => {
      if (!warmingBot.current || event.name !== warmingBot.current) return;
      setWarming(event.served ? 'ready' : 'failed');
      if (event.served) {
        // Served: the wait is over, and so is what the page said about it.
        warmingBot.current = '';
        setNotice('');
        setNoticeWarn(false);
      } else {
        setNoticeWarn(true);
        setNotice(
          'Hermes is not serving it yet — it will come up at the next scan of the host.',
        );
      }
    });
  }, []);

  /**
   * A bot that was made can be corrected: the person goes back, changes the
   * name, the shape or the colour, and the host is told — so the bot wears
   * what they chose when they come back to it.
   */
  async function correctBot(next: {
    title?: string;
    color?: string;
    shape?: BloubShape;
  }): Promise<boolean> {
    const made = madeBot;
    if (!made) return false;
    if (!bridge?.updateBot) return false;
    const title = next.title ?? made.title;
    const color = next.color ?? made.color;
    const shape = next.shape ?? made.shape;
    try {
      await bridge.updateBot({ name: made.name, title, color, shape });
    } catch {
      return false;
    }
    setMadeBot({ ...made, title, color, shape });
    return true;
  }

  /**
   * Makes the first bot. The answer carries what the page has to say after
   * the step changes: the notice about a bot that exists but does not answer
   * yet would be wiped by the move itself, so it travels with the result.
   */
  async function handleCreateBot(input: {
    shape: BloubShape;
    /** The colour the person chose; absent when they chose none. */
    color?: string;
  }): Promise<{
    made: boolean;
    notice?: string;
    connectionError?: boolean;
    error?: string;
  }> {
    const title = botName.trim();
    if (!title) return { made: false };
    setBusy('bot');
    setError('');
    setHelp(null);
    setNotice('');
    // A bot that is already there is corrected, not made again: the person
    // went back and changed its colour, its shape or its name.
    if (madeBot) {
      await correctBot({ title, color: input.color, shape: input.shape });
      setBusy('none');
      return { made: true };
    }
    if (!bridge?.createBot) return { made: false };
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
        created: false,
        served: false,
      }));
    if (!result.ok && !result.created) {
      // The link dropped while the person was picking a face: there is no
      // settings page to point at from the setup, so the setup goes back to
      // the connection itself instead of quoting it.
      if (/not connected/i.test(result.error ?? '')) {
        setBusy('none');
        return { made: false, connectionError: true };
      }
      setBusy('none');
      return {
        made: false,
        error: result.error ?? 'The bot could not be created.',
      };
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
    setBusy('none');
    // A bot that is on the host but not answering yet is still a bot that was
    // made: the setup shows it and says what is missing, instead of asking
    // for a name Hermes would now refuse as already taken.
    if (!result.ok) {
      return {
        made: true,
        notice:
          result.error ??
          'The bot was created, but Hermes has not answered for it yet.',
      };
    }
    // The gateway serves a new profile at its next scan: the bot is made, and
    // it is on its way. The page says so and the shell says when it is there.
    if (result.served === false) {
      warmingBot.current = name;
      setWarming('pending');
      return {
        made: true,
        notice: 'Hermes is starting this bot — it will answer in a moment.',
      };
    }
    setWarming('ready');
    return { made: true };
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
    // The bot the person made travels with the setup: the server may not list
    // it yet, and the sidebar has to carry it until it does.
    onFinish(
      madeBot
        ? {
            name: madeBot.name,
            title: madeBot.title,
            color: madeBot.color,
            shape: madeBot.shape,
          }
        : undefined,
    );
  }

  async function handleDismiss() {
    await remember(true);
    onDismiss();
  }

  // A host is only needed for a Hermes that runs somewhere else: on this
  // machine, the port is enough. And the scan needs no key written down
  // first — reading it where it lives is what the scan does.
  const canTest =
    (mode === 'local' || host.trim() !== '') &&
    (mode === 'local' || hasKey || apiKey.trim() !== '');
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
  // The one failure the setup can lift by itself: the door is shut because
  // there is no key in the Hermes home. That is read from the key's absence,
  // not from the words of the error, because a shut door says "No Hermes
  // answered" just as often as it says the key is missing, and the first run
  // of a machine that never had a key is exactly that case.
  const canOpenApi = mode === 'local' && !hasKey && !openApiFailed;
  // The pages that pick a shape or a colour advance on the click itself:
  // there is nothing left for a button to say. Once the bot is made, the
  // person can come back to correct it: the button says so again.
  const picksItsOwnWay =
    (step === 'face' || step === 'colour') && madeBot === null;
  // The line that says how the app will reach Hermes. A Hermes on this
  // machine needs no tunnel: the port is the way in.
  const linkLine =
    mode === 'local'
      ? `127.0.0.1:${apiPort || '8642'} — no tunnel, no SSH.`
      : `ssh -N -L 127.0.0.1:${
          localPort || '18742'
        }:127.0.0.1:${apiPort || '8642'} ${host || '<host>'}`;

  // The actor reacts to what happens: it walks the comet while the tunnel
  // opens, it asks for the look when the host refuses, and it bursts into
  // the celebration when the two of them are talking. These are the plugin's
  // moods — each is the whole theatre, played around the clock.
  const actorMood: MoodId = useMemo(() => {
    if (step !== 'setup') return 'idle';
    if (failed) return 'interaction';
    if (connected) return 'completed';
    if (busy === 'handshake') return 'running';
    return 'idle';
  }, [busy, connected, failed, step]);

  // The shape of the stage: the bot that is being picked while it is being
  // picked, the wandering actor on the first page, the scene's afterwards.
  const stageShape =
    step === 'welcome'
      ? actorShape
      : step === 'face' || step === 'colour'
        ? botFace
        : scene.shape;

  // The light of the window follows the actor, and the last scene follows the
  // bot the person made. From the face on, the preview wears the bot's own
  // colour — the big shape above the grid is the bot, not the actor.
  const light =
    step === 'ready'
      ? (madeBot?.color ?? actorColor)
      : step === 'face' || step === 'colour'
        ? botColor
        : actorColor;

  // The last page no longer blocks on the gateway: the bot is made on the
  // host and shown at once in the sidebar as warming, so the person can start
  // talking while Hermes picks it up in the background.
  const connecting = step === 'ready' && warming === 'pending';

  const primaryLabel = isLast
    ? busy === 'bot'
      ? 'Making the bot…'
      : connecting
        ? 'Start talking anyway'
        : 'Start talking'
    : step === 'welcome'
      ? 'Begin'
      : testing
        ? mode === 'local'
          ? failed
            ? 'Scan again'
            : 'Scan this Mac'
          : 'Test the connection'
        : step === 'colour' && !madeBot
          ? 'Make the bot'
          : 'Continue';

  async function makeBot(input: {
    shape: BloubShape;
    color?: string;
  }): Promise<boolean> {
    // Continuity: the page shows the bot the person just picked from the
    // first frame — name, colour, face — and the server confirms it behind.
    // The picked values travel with the click: the states have not caught up
    // yet, so reading them would preview the colour from before the click.
    // A double click costs nothing: a name that is already there is adopted.
    const previewTitle = botName.trim();
    setMadeBot({
      name: toProfileId(previewTitle),
      title: previewTitle,
      color:
        input.color ?? (profileColor(toProfileId(previewTitle)) ?? DEFAULT_COLOR),
      shape: input.shape,
    });
    // Instant: the page turns on the click, and the bot is made behind it.
    // The wait lives on the next page, never on the colour.
    goTo(stepIndex + 1);
    const made = await handleCreateBot(input);
    // The connection dropped mid-setup: back to the connection page, marked
    // as a connection error — the person has no settings to open from here.
    if (made.connectionError) {
      setMadeBot(null);
      setConnected(false);
      setFailed(true);
      setChecks(emptyChecks());
      goTo(STEPS.indexOf('setup'));
      setError('Not connected to Hermes — reconnect to continue.');
      return false;
    }
    if (!made.made) {
      // Nothing was made: the preview goes with it, back to the colour.
      setMadeBot(null);
      goTo(STEPS.indexOf('colour'));
      setError(made.error ?? 'The bot could not be created.');
      return false;
    }
    if (made.notice) {
      setNoticeWarn(true);
      setNotice(made.notice);
    }
    return true;
  }

  async function handlePrimary() {
    if (isLast) {
      await handleFinish();
      return;
    }
    if (testing) {
      await (mode === 'local' ? scanLocal() : runHandshake());
      return;
    }
    if (step === 'name') {
      // The name is the title the bot answers to: a correction is told to
      // the host before the page gets out of the way.
      if (madeBot) await correctBot({ title: botName.trim() });
      goTo(stepIndex + 1);
      return;
    }
    if (step === 'face') {
      // The shape is worn everywhere the bot shows up.
      if (madeBot) await correctBot({ shape: botFace });
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
        <span className="onboarding-glow is-slate" />
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
              {/* The bot the person made, celebrating in the colour and
                  shape that were picked: the arrival is its own theatre. */}
              <MoodBloub
                color={madeBot.color}
                shape={madeBot.shape}
                mood="completed"
                size={120}
              />
            </div>
          ) : (
            <div className="onboarding-actor">
              <span className="onboarding-halo" aria-hidden="true" />
              {/* The actor is for touching: a click loans it another face,
                  the way the plugin's balls answer the hand. */}
              <MoodBloub
                color={light}
                shape={stageShape}
                mood={actorMood}
                size={196}
                interactive
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
                      setHelp(null);
                      // Coming back to this Mac is coming back to a scan.
                      setScanned(false);
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
                      setHelp(null);
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

              {mode === 'ssh' && savedHosts === null ? (
                <p className="onboarding-hosts-hint">Reading the SSH config…</p>
              ) : null}

              {mode === 'ssh' && savedHosts !== null && savedHosts.length > 0 ? (
                <div className="onboarding-hosts">
                  {savedHosts.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`onboarding-host ${
                        host === name ? 'is-chosen' : ''
                      }`}
                      disabled={busy !== 'none'}
                      onClick={() => void pickSavedHost(name)}
                    >
                      <span className="onboarding-host-name">{name}</span>
                      <span className="onboarding-host-cue">
                        {connected && host === name ? 'Connected' : 'Connect'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {mode === 'ssh' && savedHosts !== null && savedHosts.length === 0 ? (
                <p className="onboarding-hosts-hint">
                  No host saved in your SSH config — write it below.
                </p>
              ) : null}

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
                      setHelp(null);
                    }}
                  />
                </div>
              ) : null}

              {mode === 'local' ? (
                hasKey ? null : (
                  <p className="onboarding-key-guide">
                    No key to paste — the app reads API_SERVER_KEY from
                    ~/.hermes/.env on its own.
                  </p>
                )
              ) : (
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
                      setHelp(null);
                      setNotice('');
                    }}
                  />
                </div>
              )}

              {mode === 'ssh' ? (
                <div className="onboarding-actions">
                  <button
                    type="button"
                    className="onboarding-button is-quiet"
                    disabled={busy !== 'none' || !host.trim()}
                    onClick={() => void handleImport()}
                  >
                    {busy === 'import'
                      ? 'Reading…'
                      : `Read it from ${host}`}
                  </button>
                  {hasKey ? (
                    <span className="onboarding-stamp">In the Keychain</span>
                  ) : null}
                </div>
              ) : hasKey ? (
                <div className="onboarding-actions">
                  <span className="onboarding-stamp">In the Keychain</span>
                </div>
              ) : null}

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

              {help || error ? (
                <div className="onboarding-failure">
                  {help ? <SetupHelp help={help} /> : null}
                  {help ? null : (
                    <span className="onboarding-error">{error}</span>
                  )}
                  <div className="onboarding-actions">
                    {/*
                      The one failure the setup can lift by itself: the server
                      is off because no key exists, and Hermes can be asked to
                      make one. Every other failure is a host, a port or a
                      tunnel, and stays a thing to look at.
                    */}
                    {canOpenApi ? (
                      <button
                        type="button"
                        className="onboarding-button"
                        disabled={busy !== 'none'}
                        onClick={() => void openApi()}
                      >
                        {busy === 'open-api'
                          ? 'Turning it on…'
                          : 'Turn the API server on'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="onboarding-button is-quiet"
                      disabled={busy !== 'none'}
                      onClick={() =>
                        void (mode === 'local' ? scanLocal() : runHandshake())
                      }
                    >
                      Try again
                    </button>
                  </div>
                  {canOpenApi ? (
                    <p className="onboarding-api-hint">
                      Writes a key into the .env of the Hermes home with
                      Hermes&apos; own command, has the gateway pick it up, and
                      reads the key back. A key already there is never
                      replaced. Hermes takes the key when it restarts, so half
                      a minute without the messaging bots, and the work it
                      finishes first, are part of the wait.
                    </p>
                  ) : null}
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
                    setHelp(null);
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
                  // A bot that was made and is being corrected: the host is
                  // told, so the shape it wears is the one that was chosen.
                  if (madeBot) void correctBot({ shape });
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
            <>
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
            </>
          ) : null}

          {error && step !== 'setup' ? (
            <p className="onboarding-error is-alone">{error}</p>
          ) : null}
          {notice ? (
            <p
              className={
                noticeWarn ? 'onboarding-notice is-warning' : 'onboarding-notice'
              }
            >
              {notice}
            </p>
          ) : null}
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
              disabled={
                busy !== 'none' || (testing ? !canTest : !canContinue)
              }
              onClick={() => void handlePrimary()}
            >
              {busy === 'handshake'
                ? mode === 'local'
                  ? 'Scanning…'
                  : 'Connecting…'
                : primaryLabel}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
