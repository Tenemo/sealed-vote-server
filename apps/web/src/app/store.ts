import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { pollsApi } from 'features/Polls/pollsApi';

export const rootReducer = combineSlices(pollsApi);

export type RootState = ReturnType<typeof rootReducer>;

export const store = configureStore({
    reducer: rootReducer,
    devTools: import.meta.env.MODE !== 'production',
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(pollsApi.middleware),
});

setupListeners(store.dispatch);

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];
