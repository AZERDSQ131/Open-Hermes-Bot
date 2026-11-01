/**
 * Dictation: the microphone, transcribed by the phone itself.
 *
 * The recogniser is the platform's own — the Web Speech API, which on iOS and
 * macOS is the same on-device model Siri listens with. Nothing is recorded,
 * nothing is uploaded, and no audio leaves the phone: what the composer gets
 * is the text, as it is said and once it settles.
 *
 * Where the platform offers no recogniser, `startDictation` says so by
 * returning null, and the composer falls back to what it did before: a voice
 * note with a duration.
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

function engine(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Whether this platform can hear: the answer does not change while it runs. */
export function dictationAvailable(): boolean {
  return engine() !== null;
}

export type Dictation = {
  /** What has been heard so far, the settled part only. */
  heard: () => string;
  stop: () => string;
};

/** Why the phone stopped listening, when it is not the person who said so. */
export type Refusal = 'refused' | 'network';

/**
 * Listening. `onText` is called as the words settle and as they are guessed,
 * so the composer can show the sentence being built; the value returned by
 * `stop` is the settled transcript, which is what gets sent.
 */
export function startDictation(
  onText: (text: string) => void,
  onRefusal?: (reason: Refusal) => void,
): Dictation | null {
  const Recogniser = engine();
  if (!Recogniser) return null;

  const listening = new Recogniser();
  listening.continuous = true;
  listening.interimResults = true;
  listening.lang = typeof navigator === 'undefined' || !navigator.language ? 'en-US' : navigator.language;

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

  // A refusal is said once, quietly: the permission prompt is the
  // platform's, not ours to rephrase.
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
  // sentence. Listening again is what keeps the microphone open as long as
  // the person is still holding it.
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
