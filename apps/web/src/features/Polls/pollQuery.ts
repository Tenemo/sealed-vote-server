import type { PollResponse } from './pollsApi';
import { pollsApi } from './pollsApi';

import { store, type AppDispatch, type RootState } from 'app/store';

const createAbortError = (): Error => {
    const error = new Error('Poll query aborted.');
    error.name = 'AbortError';

    return error;
};

const selectPollResult = (
    state: RootState,
    pollId: string,
): PollResponse | null =>
    pollsApi.endpoints.getPoll.select(pollId)(state).data ?? null;

export const fetchFreshPoll = async (
    dispatch: AppDispatch,
    pollId: string,
): Promise<PollResponse> =>
    await dispatch(
        pollsApi.endpoints.getPoll.initiate(pollId, {
            forceRefetch: true,
            subscribe: false,
        }),
    ).unwrap();

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
