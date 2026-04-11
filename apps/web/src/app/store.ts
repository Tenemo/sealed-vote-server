import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { pollsApi } from 'features/Polls/pollsApi';

const rootReducer = combineSlices(pollsApi);

export const store = configureStore({
    reducer: rootReducer,
    devTools: import.meta.env.MODE !== 'production',
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(pollsApi.middleware),
});

setupListeners(store.dispatch);
