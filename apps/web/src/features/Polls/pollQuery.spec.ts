import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
    fetchFreshPoll,
    pollPollingIntervalMs,
    waitForPoll,
} from './pollQuery';
import type { PollResponse } from './pollsApi';

const mockedInitiate = vi.fn();
const mockedSelect = vi.fn();

vi.mock('./pollsApi', () => ({
    pollsApi: {
        endpoints: {
            getPoll: {
                initiate: (...args: unknown[]) => mockedInitiate(...args),
                select: (...args: unknown[]) => mockedSelect(...args),
            },
        },
    },
}));

const createPoll = (
    id: string,
    overrides: Partial<PollResponse> = {},
): PollResponse => ({
    id,
    slug: `poll-${id}--1234`,
    pollName: `Poll ${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    choices: ['A', 'B'],
    voters: ['Alice', 'Bob'],
    isOpen: true,
    publicKeyShareCount: 0,
    commonPublicKey: null,
    encryptedVoteCount: 0,
    encryptedTallies: [],
    decryptionShareCount: 0,
    publishedDecryptionShares: [],
    resultTallies: [],
    resultScores: [],
    ...overrides,
});

describe('poll query helpers', () => {
    beforeEach(() => {
        mockedInitiate.mockReset();
        mockedSelect.mockReset();
        mockedSelect.mockReturnValue(() => ({ data: undefined }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('returns the freshly fetched poll when refetch succeeds', async () => {
        const freshPoll = createPoll('fresh-poll');
        const dispatch = vi.fn(() => ({
            unwrap: async () => freshPoll,
        })) as never;
        const getState = vi.fn(() => ({})) as never;

        const result = await fetchFreshPoll({
            dispatch,
            getState,
            pollId: freshPoll.id,
        });

        expect(result).toEqual(freshPoll);
        expect(mockedInitiate).toHaveBeenCalledWith(freshPoll.id, {
            forceRefetch: true,
            subscribe: false,
        });
    });

    test('falls back to cached poll data when refetch fails', async () => {
        const cachedPoll = createPoll('cached-poll');
        const expectedError = new Error('Network error');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw expectedError;
            },
        })) as never;
        const getState = vi.fn(() => ({ polls: {} })) as never;

        mockedSelect.mockReturnValue(() => ({
            data: cachedPoll,
        }));

        const result = await fetchFreshPoll({
            dispatch,
            getState,
            pollId: cachedPoll.id,
        });

        expect(result).toEqual(cachedPoll);
    });

    test('falls back to the persisted poll snapshot when no query cache is available', async () => {
        const persistedPoll = createPoll('persisted-poll');
        const expectedError = new Error('Network error');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw expectedError;
            },
        })) as never;
        const getState = vi.fn(
            () =>
                ({
                    voting: {
                        [persistedPoll.id]: {
                            pollSnapshot: persistedPoll,
                        },
                    },
                }) as const,
        ) as never;

        const result = await fetchFreshPoll({
            dispatch,
            getState,
            pollId: persistedPoll.id,
        });

        expect(result).toEqual(persistedPoll);
    });

    test('throws when no fresh or cached poll is available', async () => {
        const expectedError = new Error('Network error');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw expectedError;
            },
        })) as never;
        const getState = vi.fn(() => ({ polls: {} })) as never;

        await expect(
            fetchFreshPoll({
                dispatch,
                getState,
                pollId: 'missing-poll',
            }),
        ).rejects.toBe(expectedError);
    });

    test('polls until the predicate matches', async () => {
        vi.useFakeTimers();

        const pollWithoutKey = createPoll('poll-1');
        const pollWithKey = createPoll('poll-1', {
            commonPublicKey: '12345',
            isOpen: false,
        });
        const dispatch = vi
            .fn()
            .mockReturnValueOnce({
                unwrap: async () => pollWithoutKey,
            })
            .mockReturnValueOnce({
                unwrap: async () => pollWithKey,
            }) as never;
        const getState = vi.fn(() => ({ polls: {} })) as never;

        const waitForPollPromise = waitForPoll({
            dispatch,
            getState,
            pollId: 'poll-1',
            predicate: (poll) => Boolean(poll.commonPublicKey),
        });

        await vi.advanceTimersByTimeAsync(pollPollingIntervalMs);

        await expect(waitForPollPromise).resolves.toEqual(pollWithKey);
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    test('aborts polling waits when the signal is aborted', async () => {
        vi.useFakeTimers();

        const dispatch = vi.fn(() => ({
            unwrap: async () => createPoll('poll-1'),
        })) as never;
        const getState = vi.fn(() => ({ polls: {} })) as never;
        const controller = new AbortController();

        const waitForPollPromise = waitForPoll({
            dispatch,
            getState,
            pollId: 'poll-1',
            predicate: () => false,
            signal: controller.signal,
        });

        controller.abort();

        await expect(waitForPollPromise).rejects.toThrow('Poll query aborted.');
    });
});
