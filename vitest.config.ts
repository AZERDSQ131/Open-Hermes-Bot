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
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vendor/**',
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        // Types only: there is nothing to run.
        'src/**/*.d.ts',
        'src/data.ts',
      ],
    },
  },
});
