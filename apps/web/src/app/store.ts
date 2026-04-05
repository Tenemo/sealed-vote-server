import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { createLogger } from 'redux-logger';
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

import { registerPollQueryStore } from 'features/Polls/pollQuery';
import { pollsApi } from 'features/Polls/pollsApi';
import {
    sanitizeVotingStateForPersistence,
    votingSlice,
} from 'features/Polls/votingSlice';

export const rootReducer = combineSlices(pollsApi, votingSlice);

export type RootState = ReturnType<typeof rootReducer>;

const IS_LOGGING_ENABLED = false;

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

const logger = createLogger({
    diff: true,
    collapsed: true,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
    reducer: persistedReducer,
    devTools: true, // Leaving it on for prod on purpose
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

        return IS_LOGGING_ENABLED ? middleware.concat(logger) : middleware;
    },
});

registerPollQueryStore(store);
setupListeners(store.dispatch);

export const persistor = persistStore(store);

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];
