import { CircularProgress, CssBaseline, ThemeProvider } from '@mui/material';
import * as Sentry from '@sentry/react';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';

import { apiBaseUrl, sentryTracePropagationTargets } from 'app/apiConfig';
import App from 'app/App';
import { store, persistor } from 'app/store';
import { darkTheme } from 'styles/theme';

import 'styles/global.scss';

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
                    loading={<CircularProgress />}
                    persistor={persistor}
                >
                    <HelmetProvider>
                        <ThemeProvider theme={darkTheme}>
                            <CssBaseline enableColorScheme />
                            <BrowserRouter>
                                <App />
                            </BrowserRouter>
                        </ThemeProvider>
                    </HelmetProvider>
                </PersistGate>
            </Provider>
        </React.StrictMode>
    );
};

const resolveSentryEnabled = (): boolean => {
    const configuredValue =
        import.meta.env.VITE_SENTRY_ENABLED?.trim().toLowerCase();

    if (configuredValue === 'true') {
        return true;
    }

    if (configuredValue === 'false') {
        return false;
    }

    return (
        import.meta.env.MODE !== 'development' &&
        import.meta.env.MODE !== 'test' &&
        !apiBaseUrl.startsWith('http://127.0.0.1') &&
        !apiBaseUrl.startsWith('http://localhost')
    );
};

Sentry.init({
    enabled: resolveSentryEnabled(),
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
