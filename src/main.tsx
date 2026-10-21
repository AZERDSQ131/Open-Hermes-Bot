import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ModelPrefsProvider } from './modelPrefs';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The preferences are read from the server, with the primary profile. */}
    <ModelPrefsProvider>
      <App />
    </ModelPrefsProvider>
  </StrictMode>,
);
