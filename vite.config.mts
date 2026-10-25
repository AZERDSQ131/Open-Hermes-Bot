import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The renderer talks to the main process and to nothing else. The policy
// says so: no script but ours, no connection but ours, nothing to frame us.
//
// The dev server is the exception: it injects its own script and opens a
// websocket for the hot reload, so the policy has to let it in. The built
// app gets the strict one.
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // React writes styles in attributes; a policy without this drops them.
  "style-src 'self' 'unsafe-inline'",
  // The attachment previews are object URLs, and the marks of the connectors
  // are the bytes the shell fetched: both are pictures the app already has.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const DEV_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'grok-bot-csp',
    transformIndexHtml(html, context) {
      const policy = context.server ? DEV_POLICY : POLICY;
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    // The coverage report is written while the app is open — a test run from
    // another window used to reload the renderer once per report file.
    watch: { ignored: ['**/coverage/**', '**/release/**', '**/dist/**'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
