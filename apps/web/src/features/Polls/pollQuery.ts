import type { PollResponse } from './pollsApi';
import { pollsApi } from './pollsApi';

import type { AppStore, RootState } from 'app/store';

const POLL_INTERVAL_MS = 3000;

type PollQueryStore = Pick<AppStore, 'dispatch' | 'getState' | 'subscribe'>;
type PollQueryDispatchResult = {
    unwrap: () => Promise<PollResponse>;
};
type PollQuerySubscriptionResult = PollQueryDispatchResult & {
    unsubscribe: () => void;
};

let pollQueryStore: PollQueryStore | null = null;

const selectPollQueryResult = (
    pollId: string,
): ReturnType<typeof pollsApi.endpoints.getPoll.select> =>
    pollsApi.endpoints.getPoll.select(pollId);

const getPollQueryStore = (): PollQueryStore => {
    if (!pollQueryStore) {
        throw new Error('Poll query store has not been registered.');
    }

    return pollQueryStore;
};

const createAbortError = (): Error => {
    const error = new Error('Poll query aborted.');
    error.name = 'AbortError';

    return error;
};

export const registerPollQueryStore = (store: PollQueryStore): void => {
    pollQueryStore = store;
};

export const fetchFreshPoll = async (pollId: string): Promise<PollResponse> =>
    (
        getPollQueryStore().dispatch(
            pollsApi.endpoints.getPoll.initiate(pollId, {
                forceRefetch: true,
                subscribe: false,
            }),
        ) as PollQueryDispatchResult
    ).unwrap();

export const waitForPoll = async ({
    pollId,
    predicate,
    signal,
}: {
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> => {
    const store = getPollQueryStore();
    const cachedPoll = selectPollQueryResult(pollId)(
        store.getState() as RootState,
    ).data;

    if (cachedPoll && predicate(cachedPoll)) {
        return cachedPoll;
    }

    const pollSubscription = store.dispatch(
        pollsApi.endpoints.getPoll.initiate(pollId, {
            forceRefetch: true,
            subscriptionOptions: {
                pollingInterval: POLL_INTERVAL_MS,
                skipPollingIfUnfocused: true,
            },
        }),
    ) as PollQuerySubscriptionResult;

    return await new Promise<PollResponse>((resolve, reject) => {
        let isFinished = false;
        let unsubscribe: () => void = () => undefined;
        let onAbort: () => void = () => undefined;

        const cleanup = (): void => {
            if (isFinished) {
                return;
            }

            isFinished = true;
            unsubscribe();
            pollSubscription.unsubscribe();
            signal?.removeEventListener('abort', onAbort);
        };

        const resolveIfReady = (): boolean => {
            const poll = selectPollQueryResult(pollId)(
                store.getState() as RootState,
            ).data;

            if (!poll || !predicate(poll)) {
                return false;
            }

            cleanup();
            resolve(poll);

            return true;
        };

        onAbort = (): void => {
            cleanup();
            reject(createAbortError());
        };

        unsubscribe = store.subscribe(() => {
            void resolveIfReady();
        });

        signal?.addEventListener('abort', onAbort, { once: true });

        if (resolveIfReady()) {
            return;
        }

        void pollSubscription.unwrap().catch((error: unknown) => {
            cleanup();
            reject(error);
        });
    });
};
