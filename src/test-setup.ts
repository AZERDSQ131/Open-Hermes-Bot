import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// A list whose rows share a key is a list React draws by guess: a bot can show
// twice, or not at all. That warning is a failure here, not noise in the log.
const DUPLICATE_KEY = /two children with the same key/;
const realError = console.error;
let duplicateKeys: string[] = [];

beforeEach(() => {
  duplicateKeys = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    realError(...args);
    // React prints the message with a placeholder and passes the key as an
    // argument; the log keeps both, and so does the failure.
    const message = args.map((arg) => String(arg)).join(' ');
    if (DUPLICATE_KEY.test(message)) duplicateKeys.push(message);
  });
});

// The app talks to the main process through a bridge on the window. The tests
// put their own there, and every test starts from a clean window.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { hermes?: unknown }).hermes;
  const seen = duplicateKeys;
  duplicateKeys = [];
  if (seen.length) throw new Error(seen[0]);
});

// jsdom has no scrolling.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
