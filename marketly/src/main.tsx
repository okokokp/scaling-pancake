import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {FirebaseProvider} from './components/FirebaseProvider.tsx';
import './index.css';

declare global {
  interface Window {
    gm_authFailure?: () => void;
    __marketlyGmpPatched?: boolean;
  }
}

if (typeof window !== 'undefined' && !window.__marketlyGmpPatched) {
  window.__marketlyGmpPatched = true;
  window.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', {detail: {reason: 'auth'}}));
  };
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    try {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (/OverQuotaMapError|QuotaExceeded|ApiTargetBlockedMapError|RefererNotAllowedMapError/i.test(msg)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', {detail: {reason: 'quota'}}));
      }
    } catch {
      // ignore stringify errors
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <FirebaseProvider>
      <App />
    </FirebaseProvider>
  </ErrorBoundary>
);
