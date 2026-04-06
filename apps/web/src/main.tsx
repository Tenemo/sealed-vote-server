import * as Sentry from '@sentry/react';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';

import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { apiBaseUrl, sentryTracePropagationTargets } from 'app/apiConfig';
import App from 'app/App';
import { resolveSentryEnabled } from 'app/sentryConfig';
import { store, persistor } from 'app/store';
import { ThemeProvider } from 'components/ThemeProvider';

import './index.css';

export const Root = (): React.JSX.Element => {
  useEffect(() => {
    // https://stackoverflow.com/questions/31402576/enable-focus-only-on-keyboard-use-or-tab-press
    const handleMouseDown = (): void => {
      document.body.classList.add('using-mouse');
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        document.body.classList.remove('using-mouse');
      }
    };

    document.body.addEventListener('mousedown', handleMouseDown);
    document.body.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.removeEventListener('mousedown', handleMouseDown);
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <React.StrictMode>
      <Provider store={store}>
        <PersistGate
          loading={<Spinner className="size-6" />}
          persistor={persistor}
        >
          <HelmetProvider>
            <ThemeProvider defaultTheme="dark">
              <TooltipProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </TooltipProvider>
            </ThemeProvider>
          </HelmetProvider>
        </PersistGate>
      </Provider>
    </React.StrictMode>
  );
};

Sentry.init({
  enabled: resolveSentryEnabled({
    apiBaseUrl,
    configuredValue: import.meta.env.VITE_SENTRY_ENABLED,
    currentHostname: window.location.hostname,
    currentOrigin: window.location.origin,
    mode: import.meta.env.MODE,
  }),
  dsn: 'https://dce8580406e67b8cfe162b02e3d16e58@o502294.ingest.sentry.io/4506770255642624',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: sentryTracePropagationTargets,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

const container = document.getElementById('root');

const root = createRoot(container!);
root.render(<Root />);
