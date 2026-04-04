import type { Action, ThunkAction } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
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
import storageSession from 'redux-persist/lib/storage/session';

import { pollsApi } from 'features/Polls/pollsApi';
import {
    sanitizeVotingStateForPersistence,
    votingSlice,
} from 'features/Polls/votingSlice';

export type RootState = ReturnType<typeof rootReducer>;

const IS_LOGGING_ENABLED = false;

const votingSessionTransform = createTransform(
    sanitizeVotingStateForPersistence,
    (outboundState) => outboundState,
    { whitelist: ['voting'] },
);

const persistConfig = {
    key: 'root',
    storage: storageSession,
    stateReconciler: hardSet,
    blacklist: [pollsApi.reducerPath],
    transforms: [votingSessionTransform],
    version: 1,
};

const logger = createLogger({
    diff: true,
    collapsed: true,
});

export const rootReducer = combineReducers({
    polls: pollsApi.reducer,
    voting: votingSlice.reducer,
});
const persistedReducer = persistReducer(persistConfig, rootReducer);

const middleware = [pollsApi.middleware];

export const store = configureStore({
    reducer: persistedReducer,
    devTools: true, // Leaving it on for prod on purpose
    middleware: (getDefaultMiddleware) =>
        IS_LOGGING_ENABLED
            ? getDefaultMiddleware({
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
              })
                  .concat(middleware)
                  .concat(logger)
            : getDefaultMiddleware({
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
              }).concat(middleware),
});
export const persistor = persistStore(store);

export type AppStore = typeof store;
export type AppDispatch = AppStore['dispatch'];
export type AppThunk<ThunkReturnType = void> = ThunkAction<
    ThunkReturnType,
    RootState,
    unknown,
    Action
>;
