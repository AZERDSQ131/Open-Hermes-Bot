import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The whole point: a line nobody exercises is a line nobody knows.
      thresholds: {
        lines: 89,
        functions: 82,
        branches: 81,
        statements: 89,
        // The rules of a conversation are the part that must be complete.
        'src/group.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/conversations.ts': {
          lines: 100,
          functions: 100,
          statements: 100,
        },
        'src/modelPrefs.tsx': {
          lines: 100,
          functions: 100,
          statements: 100,
        },
        'src/profileColor.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/reactions.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/recording.ts': {
          lines: 100,
          functions: 100,
          statements: 100,
        },
        'src/turns.ts': {
          lines: 98,
          functions: 100,
          branches: 100,
          statements: 98,
        },
        // What an update means, in words: the states and what they say.
        'src/updates.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The rules of the update: what is looked for, and what happens to
        // it. The bridge cannot be checked by hand.
        'electron/updater.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The setup is a path, not a rule: every step of it is walked
        // through by a test, and the floor keeps it that way.
        'src/onboarding.tsx': {
          lines: 95,
          functions: 85,
          branches: 85,
          statements: 95,
        },
        // The actor is a character, not a face: it is drawn, it changes its
        // shape, it shouts, and it holds still when asked to.
        'src/components/StageBloub.tsx': {
          lines: 100,
          functions: 100,
          branches: 70,
          statements: 100,
        },
        // The rules of the two connections: where Hermes runs decides how
        // the app reaches it, and the bridge cannot be checked by hand.
        'electron/connection.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // What may be asked for, and what may not: the marks of the
        // connectors are the only picture the app fetches, and the rule is
        // a rule of the network.
        'electron/logos.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // How a model is named on both sides of the door: `auto` and a
        // prefixed id must not reach the lock as if they were a pair.
        'electron/models.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The end of a turn: why it stopped, what it still answered, and how
        // long silence is allowed to last.
        'electron/stream.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The key of the host, and the moment it stops being the key: a
        // refusal that cannot be recovered from is a dead end.
        'electron/keys.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The read of the connectors: one shell for everyone who asks, and
        // an answer from a moment ago given again instead of waking the host.
        'electron/connectors.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The link and the reason the host prints when a service signs in:
        // the only two things the shell reads out of a login.
        'electron/mcp.js': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
      // One list, not two: a second "include" key replaces the first one
      // whole, and the file that fell out of it was the updater — the one
      // the gate below says must be complete.
      include: [
        'src/**/*.{ts,tsx}',
        'electron/updater.js',
        'electron/connection.js',
        'electron/logos.js',
        'electron/keys.js',
        'electron/stream.js',
        'electron/models.js',
        'electron/connectors.js',
        'electron/mcp.js',
      ],
      exclude: [
        'src/vendor/**',
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        // Types only: there is nothing to run.
        'src/**/*.d.ts',
        'src/data.ts',
        'electron/**/*.test.js',
      ],
    },
  },
});
