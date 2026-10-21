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
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vendor/**',
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
      ],
    },
  },
});
