import React from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import App from 'app/App';
import { store } from 'app/store';

import './index.css';

export const Root = (): React.JSX.Element => (
    <React.StrictMode>
        <Provider store={store}>
            <HelmetProvider>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </HelmetProvider>
        </Provider>
    </React.StrictMode>
);

type RootContainer = HTMLElement & {
    __sealedVoteRoot?: ReactRoot;
};

const container = document.getElementById('root') as RootContainer | null;

if (!container) {
    throw new Error('The app root container is missing.');
}

const root = container.__sealedVoteRoot ?? createRoot(container);
container.__sealedVoteRoot = root;

root.render(<Root />);
