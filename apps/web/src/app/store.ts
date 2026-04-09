import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import {
    persistStore,
    persistReducer,
    createTransform,
    createMigrate,
    FLUSH,
    REHYDRATE,
    PAUSE,
    PERSIST,
    PURGE,
    REGISTER,
} from 'redux-persist';

import { rootPersistStateReconciler } from './persistStateReconciler';
import { localPersistStorage } from './persistStorage';

import { pollsApi } from 'features/Polls/pollsApi';
import {
    sanitizeVotingStateForPersistence,
    votingSlice,
} from 'features/Polls/votingSlice';

export const rootReducer = combineSlices(pollsApi, votingSlice);

export type RootState = ReturnType<typeof rootReducer>;

const persistVersion = 3;

const votingSessionTransform = createTransform(
    sanitizeVotingStateForPersistence,
    sanitizeVotingStateForPersistence,
    { whitelist: ['voting'] },
);

const persistConfig = {
    key: 'root',
    storage: localPersistStorage,
    stateReconciler: rootPersistStateReconciler,
    blacklist: [pollsApi.reducerPath],
    transforms: [votingSessionTransform],
    version: persistVersion,
    migrate: createMigrate(
        {
            3: () => undefined,
        },
        {
            debug: false,
        },
    ),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
    reducer: persistedReducer,
    devTools: import.meta.env.MODE !== 'production',
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
