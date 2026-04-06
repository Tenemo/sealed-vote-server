import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import {
    persistStore,
    persistReducer,
    createTransform,
    FLUSH,
    REHYDRATE,
    PAUSE,
    PERSIST,
    PURGE,
    REGISTER,
} from 'redux-persist';
import hardSet from 'redux-persist/lib/stateReconciler/hardSet';

import { sessionPersistStorage } from './persistStorage';
import { shouldEnableReduxDevTools } from './reduxDevTools';

import { pollsApi } from 'features/Polls/pollsApi';
import {
    sanitizeVotingStateForPersistence,
    votingSlice,
} from 'features/Polls/votingSlice';

export const rootReducer = combineSlices(pollsApi, votingSlice);

export type RootState = ReturnType<typeof rootReducer>;

const votingSessionTransform = createTransform(
    sanitizeVotingStateForPersistence,
    (outboundState) => outboundState,
    { whitelist: ['voting'] },
);

const persistConfig = {
    key: 'root',
    storage: sessionPersistStorage,
    stateReconciler: hardSet,
    blacklist: [pollsApi.reducerPath],
    transforms: [votingSessionTransform],
    version: 1,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
    reducer: persistedReducer,
    devTools: shouldEnableReduxDevTools(import.meta.env.MODE),
    middleware: (getDefaultMiddleware) => {
        const middleware = getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: [
                    FLUSH,
                    REHYDRATE,
                    PAUSE,
                    PERSIST,
                    PURGE,
                    REGISTER,
                ],
            },
        }).concat(pollsApi.middleware);
        return middleware;
    },
});

setupListeners(store.dispatch);

export const persistor = persistStore(store);

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];
