import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The app talks to the main process through a bridge on the window. The tests
// put their own there, and every test starts from a clean window.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { hermes?: unknown }).hermes;
});
