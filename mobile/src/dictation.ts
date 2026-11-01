import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Dictation: the microphone, transcribed by the phone itself.
 *
 * Two engines, one of them used: the system's own recogniser on the phone
 * (`expo-speech-recognition`, which is SFSpeechRecognizer on iOS, asked for
 * on-device only), and the browser's Web Speech API on the web, which is the
 * same model under Safari. Nothing is recorded, nothing is uploaded, and no
 * audio leaves the device: what the composer gets is the text.
 *
 * Expo Go carries no speech module — it is a client with a fixed set of
 * natives — so `startDictation` says so by returning null there, and the
 * composer offers what the phone does carry: the keyboard's own microphone.
 */

type Result = { isFinal: boolean; 0: { transcript: string } };

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<Result>;
};

type Failure = { error?: string };

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((failure: Failure) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

/** Why the phone stopped listening, when it is not the person who said so. */
export type Refusal = 'refused' | 'network' | 'missing';

export type Dictation = {
  /** What has been heard so far, the settled part only. */
  heard: () => string;
  stop: () => string;
};

type Subscription = { remove: () => void };

/** The shape of `expo-speech-recognition` this file uses, and no more. */
type NativeSpeech = {
  ExpoSpeechRecognitionModule: {
    start: (options: Record<string, unknown>) => void;
    stop: () => void;
    abort: () => void;
    addListener: (event: string, listener: (payload: never) => void) => Subscription;
  };
};

/**
 * The native module, when the build carries it. Expo Go does not: it has a
 * fixed set of natives, and the package's own `requireNativeModule` throws
 * while the bundle is being read — an error the red box reports even when a
 * `catch` is waiting for it. So the registry is asked first, quietly, and
 * the package is only read once its native side is known to be there.
 */
function native(): NativeSpeech['ExpoSpeechRecognitionModule'] | null {
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const found = require('expo-speech-recognition') as NativeSpeech;
    return found?.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

function browser(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function dictationAvailable(): boolean {
  return native() !== null || browser() !== null;
}

/** The language the person actually reads, when the platform knows it. */
function spoken(): string {
  const tag =
    typeof navigator === 'undefined' || !navigator.language ? 'en-US' : navigator.language;
  return tag;
}

function fromBrowser(onText: (text: string) => void, onRefusal?: (why: Refusal) => void) {
  const Recogniser = browser();
  if (!Recogniser) return null;

  const listening = new Recogniser();
  listening.continuous = true;
  listening.interimResults = true;
  listening.lang = spoken();

  let settled = '';
  let stopped = false;
  let restarts = 0;

  listening.onresult = (event) => {
    let guessed = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const said = result[0]?.transcript ?? '';
      if (result.isFinal) settled = `${settled} ${said}`.trim();
      else guessed += said;
    }
    onText(`${settled} ${guessed}`.trim());
  };

  listening.onerror = (failure) => {
    const reason = failure?.error;
    if (reason === 'not-allowed' || reason === 'service-not-allowed') {
      stopped = true;
      onRefusal?.('refused');
      return;
    }
    if (reason === 'network') onRefusal?.('network');
  };

  // Chromium ends the session on its own after a silence, and iOS after a
  // sentence: listening again is what keeps the microphone open.
  listening.onend = () => {
    if (stopped || restarts > 60) return;
    restarts += 1;
    try {
      listening.start();
    } catch {
      stopped = true;
    }
  };

  try {
    listening.start();
  } catch {
    return null;
  }

  return {
    heard: () => settled,
    stop: () => {
      stopped = true;
      try {
        listening.stop();
      } catch {
        // Already stopped: nothing was listening any more.
      }
      return settled;
    },
  };
}

function fromPhone(onText: (text: string) => void, onRefusal?: (why: Refusal) => void) {
  const speech = native();
  if (!speech) return null;

  let settled = '';
  let stopped = false;
  const stops: Subscription[] = [];

  stops.push(
    speech.addListener('result' as never, ((event: {
      isFinal?: boolean;
      results?: { transcript?: string }[];
    }) => {
      const said = event.results?.[0]?.transcript ?? '';
      if (event.isFinal) settled = `${settled} ${said}`.trim();
      onText(event.isFinal ? settled : `${settled} ${said}`.trim());
    }) as never),
  );

  stops.push(
    speech.addListener('error' as never, ((event: { error?: string }) => {
      const reason = event?.error;
      if (reason === 'not-allowed' || reason === 'service-not-allowed') {
        stopped = true;
        onRefusal?.('refused');
      } else if (reason === 'network') {
        onRefusal?.('network');
      }
    }) as never),
  );

  try {
    speech.start({
      lang: spoken(),
      interimResults: true,
      continuous: true,
      // The phone's own model, never a server: this is the whole point.
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
  } catch {
    for (const stop of stops) stop.remove();
    return null;
  }

  return {
    heard: () => settled,
    stop: () => {
      stopped = true;
      try {
        speech.stop();
      } catch {
        // Already stopped.
      }
      for (const stop of stops) stop.remove();
      void stopped;
      return settled;
    },
  };
}

/**
 * Listening. `onText` is called as the words settle and as they are guessed,
 * so the composer can show the sentence being built; the value returned by
 * `stop` is the settled transcript, which is what gets sent.
 */
export function startDictation(
  onText: (text: string) => void,
  onRefusal?: (why: Refusal) => void,
): Dictation | null {
  return fromPhone(onText, onRefusal) ?? fromBrowser(onText, onRefusal);
}
