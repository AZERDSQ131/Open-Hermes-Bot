// The dictation: the app records what the person says and Hermes writes it
// down. The browser's own speech service is not used: the key Chromium
// carries is refused by the service, and that refusal looks exactly like a
// broken connection.

/** The recorder: what it records, and how it is stopped. */
export type Recording = {
  stop: () => void;
  /** The recording, as it is. */
  blob: () => Promise<Blob>;
  mimeType: string;
};

/**
 * Starts recording. The window asks for the microphone — and only the
 * microphone — when the person asks for it.
 */
export async function startRecording(): Promise<Recording> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    throw new Error('This build cannot record.');
  }
  const stream = await media.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start();
  return {
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    stop: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // The recorder is already done.
      }
      for (const track of stream.getTracks()) track.stop();
    },
    blob: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
      }),
  };
}

/** The format Chromium records best, when the browser knows it. */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/** The bytes of a recording, as the bridge carries them. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const piece = 0x8000;
  for (let index = 0; index < buffer.length; index += piece) {
    binary += String.fromCharCode(...buffer.subarray(index, index + piece));
  }
  return btoa(binary);
}
