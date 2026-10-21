import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blobToBase64, startRecording } from './recording';

class FakeRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice']) });
    this.onstop?.();
  });
}

describe('the recorder', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: () => undefined }],
        })),
      },
    });
  });

  it('records what the microphone hears', async () => {
    const recording = await startRecording();
    expect(recording.mimeType).toContain('audio/webm');
    recording.stop();
    const blob = await recording.blob();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('stops the microphone when the recording stops', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })),
      },
    });
    const recording = await startRecording();
    recording.stop();
    expect(stop).toHaveBeenCalled();
  });

  it('says so when the build cannot record', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    await expect(startRecording()).rejects.toThrow('cannot record');
  });

  it('says so when the microphone is refused', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          const error = new Error('denied');
          error.name = 'NotAllowedError';
          throw error;
        }),
      },
    });
    await expect(startRecording()).rejects.toThrow('denied');
  });

  it('takes the format the browser knows best', async () => {
    const recording = await startRecording();
    expect(recording.mimeType).toBe('audio/webm;codecs=opus');
  });

  it('falls back to what the browser knows', async () => {
    FakeRecorder.isTypeSupported = vi.fn(() => false);
    const recording = await startRecording();
    expect(recording.mimeType).toBeTruthy();
    FakeRecorder.isTypeSupported = vi.fn(() => true);
  });
});

describe('the bytes of a recording', () => {
  it('travel as text', async () => {
    const blob = new Blob(['hello']);
    const data = await blobToBase64(blob);
    expect(atob(data)).toBe('hello');
  });

  it('travel in pieces, so a long recording does not blow the stack', async () => {
    const long = 'x'.repeat(0x8000 * 2 + 10);
    const data = await blobToBase64(new Blob([long]));
    expect(atob(data).length).toBe(long.length);
  });
});
