import type { PollResponse } from './pollsApi';
import { pollsApi } from './pollsApi';
import { selectVoteStateByPollId } from './votingState';

import { type AppDispatch, type RootState } from 'app/store';

const defaultPollPollingIntervalMs = 5000;
const minimumPollPollingIntervalMs = 250;

const resolvePollPollingIntervalMs = (rawValue: string | undefined): number => {
    if (!rawValue) {
        return defaultPollPollingIntervalMs;
    }

    const parsedValue = Number(rawValue);

    if (
        !Number.isFinite(parsedValue) ||
        !Number.isInteger(parsedValue) ||
        parsedValue < minimumPollPollingIntervalMs
    ) {
        return defaultPollPollingIntervalMs;
    }

    return parsedValue;
};

export const pollPollingIntervalMs = resolvePollPollingIntervalMs(
    import.meta.env.VITE_POLLING_INTERVAL_MS,
);

const createAbortError = (): Error => {
    const error = new Error('Poll query aborted.');
    error.name = 'AbortError';

    return error;
};

const isPollResponse = (value: unknown): value is PollResponse =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string';

const selectCachedPoll = (
    state: RootState,
    pollId: string,
): PollResponse | null => {
    const cachedPoll = pollsApi.endpoints.getPoll.select(pollId)(state).data;
    return cachedPoll?.id === pollId ? cachedPoll : null;
};

const selectPersistedPollSnapshot = (
    state: RootState,
    pollId: string,
): PollResponse | null => {
    const persistedPoll = selectVoteStateByPollId(
        state.voting ?? {},
        pollId,
    ).pollSnapshot;
    return persistedPoll?.id === pollId ? persistedPoll : null;
};

const selectFallbackPoll = (
    state: RootState,
    pollId: string,
): PollResponse | null =>
    selectCachedPoll(state, pollId) ??
    selectPersistedPollSnapshot(state, pollId);

const waitForDelay = async (
    delayMs: number,
    signal?: AbortSignal,
): Promise<void> => {
    if (delayMs <= 0) {
        if (signal?.aborted) {
            throw createAbortError();
        }

        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timeoutHandle: {
            current: ReturnType<typeof globalThis.setTimeout> | null;
        } = {
            current: null,
        };
        const onAbort = (): void => {
            if (timeoutHandle.current !== null) {
                globalThis.clearTimeout(timeoutHandle.current);
            }
            reject(createAbortError());
        };
        timeoutHandle.current = globalThis.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);

        if (signal?.aborted) {
            onAbort();
            return;
        }

        signal?.addEventListener('abort', onAbort, { once: true });
    });
};

export const fetchFreshPoll = async ({
    dispatch,
    getState,
    pollId,
}: {
    dispatch: AppDispatch;
    getState: () => RootState;
    pollId: string;
}): Promise<PollResponse> => {
    try {
        const freshPoll = await dispatch(
            pollsApi.endpoints.getPoll.initiate(pollId, {
                forceRefetch: true,
                subscribe: false,
            }),
        ).unwrap();

        if (isPollResponse(freshPoll) && freshPoll.id === pollId) {
            return freshPoll;
        }
    } catch (error) {
        const fallbackPoll = selectFallbackPoll(getState(), pollId);
        if (fallbackPoll) {
            return fallbackPoll;
        }

        throw error;
    }

    const fallbackPoll = selectFallbackPoll(getState(), pollId);
    if (fallbackPoll) {
        return fallbackPoll;
    }

    throw new Error(`Poll ${pollId} could not be fetched.`);
};

export const waitForPoll = async ({
    dispatch,
    getState,
    pollId,
    predicate,
    signal,
}: {
    dispatch: AppDispatch;
    getState: () => RootState;
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> => {
    while (true) {
        if (signal?.aborted) {
            throw createAbortError();
        }

        const fallbackPoll = selectFallbackPoll(getState(), pollId);
        if (fallbackPoll && predicate(fallbackPoll)) {
            return fallbackPoll;
        }

        const poll = await fetchFreshPoll({
            dispatch,
            getState,
            pollId,
        });
        if (predicate(poll)) {
            return poll;
        }

        await waitForDelay(pollPollingIntervalMs, signal);
    }
};
