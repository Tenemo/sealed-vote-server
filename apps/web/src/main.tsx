import * as Sentry from '@sentry/react';
import React from 'react';
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
import { registerOfflineServiceWorker } from 'app/serviceWorker';
import { store, persistor } from 'app/store';
import RecoveryCoordinator from 'features/Polls/RecoveryCoordinator';

import './index.css';

export const Root = (): React.JSX.Element => {
    return (
        <React.StrictMode>
            <Provider store={store}>
                <PersistGate
                    loading={
                        <div className="flex min-h-screen items-center justify-center">
                            <Spinner className="size-10" />
                        </div>
                    }
                    persistor={persistor}
                >
                    <RecoveryCoordinator />
                    <HelmetProvider>
                        <TooltipProvider>
                            <BrowserRouter>
                                <App />
                            </BrowserRouter>
                        </TooltipProvider>
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

void registerOfflineServiceWorker();
