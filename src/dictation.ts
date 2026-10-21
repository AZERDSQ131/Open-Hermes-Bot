// The dictation: Chromium listens and writes the words down, and they land
// in the composer. A microphone that cannot be used says so instead of
// pretending to record.

/** The little of the Web Speech API the app needs. */
export type Dictation = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: DictationEvent) => void) | null;
  onerror: ((event: DictationError) => void) | null;
  onend: (() => void) | null;
};

export type DictationEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: { 0: { transcript: string } } };
};

export type DictationError = { error: string };

type SpeechWindow = {
  SpeechRecognition?: new () => Dictation;
  webkitSpeechRecognition?: new () => Dictation;
};

/** What the browser can offer, if anything. */
export function speechRecognition(): (new () => Dictation) | undefined {
  const win = window as unknown as SpeechWindow;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

/**
 * What Chromium says when it cannot listen, in words the person can act on.
 * The speech service runs on Google's servers: without a network, there is
 * nothing to hear.
 */
export function dictationErrorText(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is not allowed. macOS asks for permission the first time.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'The dictation needs a network connection.';
    case 'language-not-supported':
    case 'phrases-not-supported':
      return 'This language is not supported by the dictation.';
    case 'no-speech':
      return 'Nothing was heard.';
    case 'aborted':
      return 'The dictation was stopped.';
    default:
      return `The dictation could not start: ${error}`;
  }
}
