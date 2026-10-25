import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ModelPrefsProvider } from './modelPrefs';
import { installDemoBridge } from './demo';
import './styles.css';

// A window with a host that is not there: `VITE_DEMO=1 npm run dev`. It is
// installed before the app mounts, so every read lands on the same made-up
// host — and a build started without the flag never sees it.
if (import.meta.env.VITE_DEMO === '1') installDemoBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The preferences are read from the server, with the primary profile. */}
    <ModelPrefsProvider>
      <App />
    </ModelPrefsProvider>
  </StrictMode>,
);
