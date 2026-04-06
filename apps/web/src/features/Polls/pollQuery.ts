import type { PollResponse } from './pollsApi';
import { pollsApi } from './pollsApi';

const POLL_INTERVAL_MS = 3000;

type PollQueryDispatchResult = {
    unwrap: () => Promise<PollResponse>;
};

const createAbortError = (): Error => {
    const error = new Error('Poll query aborted.');
    error.name = 'AbortError';

    return error;
};

const waitForDelay = async (
    delayMs: number,
    signal?: AbortSignal,
): Promise<void> =>
    await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError());
            return;
        }

        const onAbort = (): void => {
            reject(createAbortError());
        };

        window.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);

        signal?.addEventListener('abort', onAbort, { once: true });
    });

export const fetchFreshPoll = async (
    dispatch: (action: unknown) => unknown,
    pollId: string,
): Promise<PollResponse> =>
    (
        dispatch(
            pollsApi.endpoints.getPoll.initiate(pollId, {
                forceRefetch: true,
                subscribe: false,
            }),
        ) as PollQueryDispatchResult
    ).unwrap();

export const waitForPoll = async ({
    dispatch,
    pollId,
    predicate,
    signal,
}: {
    dispatch: (action: unknown) => unknown;
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> => {
    while (true) {
        if (signal?.aborted) {
            throw createAbortError();
        }

        const poll = await fetchFreshPoll(dispatch, pollId);
        if (predicate(poll)) {
            return poll;
        }

        await waitForDelay(POLL_INTERVAL_MS, signal);
    }
};
