import React from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import { TooltipProvider } from '@/components/ui/tooltip';
import App from 'app/App';
import { store } from 'app/store';

import './index.css';

export const Root = (): React.JSX.Element => (
    <React.StrictMode>
        <Provider store={store}>
            <HelmetProvider>
                <TooltipProvider>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </TooltipProvider>
            </HelmetProvider>
        </Provider>
    </React.StrictMode>
);

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<Root />);
