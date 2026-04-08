import React from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';

import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from 'app/App';
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
                        <div className="flex min-h-[100svh] items-center justify-center">
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

const container = document.getElementById('root');

const root = createRoot(container!);
root.render(<Root />);

void registerOfflineServiceWorker();
