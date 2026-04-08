import type { PollResponse } from './pollsApi';
import { pollsApi } from './pollsApi';

import { store, type AppDispatch, type RootState } from 'app/store';

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

type PollQueryState = {
    data?: unknown;
    endpointName?: string;
    fulfilledTimeStamp?: number;
};

const getPollQueryTimestamp = (queryState: PollQueryState): number =>
    queryState.fulfilledTimeStamp ?? 0;

const selectPollResult = (
    state: RootState,
    pollId: string,
): PollResponse | null => {
    const queryStates = Object.values(
        state[pollsApi.reducerPath].queries,
    ) as Array<PollQueryState | undefined>;

    let freshestMatchingQuery: PollQueryState | undefined;

    for (const queryState of queryStates) {
        if (
            !queryState ||
            queryState.endpointName !== 'getPoll' ||
            !isPollResponse(queryState.data) ||
            queryState.data.id !== pollId
        ) {
            continue;
        }

        if (
            !freshestMatchingQuery ||
            getPollQueryTimestamp(queryState) >
                getPollQueryTimestamp(freshestMatchingQuery)
        ) {
            freshestMatchingQuery = queryState;
        }
    }

    if (freshestMatchingQuery && isPollResponse(freshestMatchingQuery.data)) {
        return freshestMatchingQuery.data;
    }

    const directPoll = pollsApi.endpoints.getPoll.select(pollId)(state).data;
    return directPoll?.id === pollId ? directPoll : null;
};

export const fetchFreshPoll = async (
    dispatch: AppDispatch,
    pollId: string,
): Promise<PollResponse> => {
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
        const cachedPoll = selectPollResult(store.getState(), pollId);
        if (cachedPoll) {
            return cachedPoll;
        }

        throw error;
    }

    const cachedPoll = selectPollResult(store.getState(), pollId);
    if (cachedPoll) {
        return cachedPoll;
    }

    throw new Error(`Poll ${pollId} could not be fetched.`);
};

export const waitForPoll = async ({
    dispatch,
    pollId,
    predicate,
    signal,
}: {
    dispatch: AppDispatch;
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> => {
    const getCachedPoll = (): PollResponse | null =>
        selectPollResult(store.getState(), pollId);

    const currentPoll = getCachedPoll();
    if (currentPoll && predicate(currentPoll)) {
        return currentPoll;
    }

    if (!currentPoll) {
        const fetchedPoll = await fetchFreshPoll(dispatch, pollId);
        if (predicate(fetchedPoll)) {
            return fetchedPoll;
        }
    }

    return await new Promise<PollResponse>((resolve, reject) => {
        let unsubscribe = (): void => undefined;

        const onAbort = (): void => {
            unsubscribe();
            reject(createAbortError());
        };

        unsubscribe = store.subscribe(() => {
            const poll = getCachedPoll();
            if (poll && predicate(poll)) {
                signal?.removeEventListener('abort', onAbort);
                unsubscribe();
                resolve(poll);
            }
        });

        if (signal?.aborted) {
            onAbort();
            return;
        }

        signal?.addEventListener('abort', onAbort, { once: true });
    });
};
