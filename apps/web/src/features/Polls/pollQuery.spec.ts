import { beforeEach, describe, expect, test, vi } from 'vitest';

import { fetchFreshPoll } from './pollQuery';
import type { PollResponse } from './pollsApi';

const mockedInitiate = vi.fn();
const mockedSelect = vi.fn();
const mockedGetState = vi.fn();

vi.mock('./pollsApi', () => ({
    pollsApi: {
        reducerPath: 'polls',
        endpoints: {
            getPoll: {
                initiate: (...args: unknown[]) => mockedInitiate(...args),
                select: (...args: unknown[]) => mockedSelect(...args),
            },
        },
    },
}));

vi.mock('app/store', () => ({
    store: {
        getState: () => mockedGetState(),
    },
}));

const createPoll = (id: string): PollResponse => ({
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
    results: [],
});

describe('fetchFreshPoll', () => {
    beforeEach(() => {
        mockedInitiate.mockReset();
        mockedSelect.mockReset();
        mockedGetState.mockReset();
        mockedSelect.mockReturnValue(() => ({ data: undefined }));
        mockedGetState.mockReturnValue({
            polls: {
                queries: {},
            },
        });
    });

    test('returns the freshly fetched poll when the refetch succeeds', async () => {
        const freshPoll = createPoll('fresh-poll');
        const dispatch = vi.fn(() => ({
            unwrap: async () => freshPoll,
        })) as never;

        const result = await fetchFreshPoll(dispatch, freshPoll.id);

        expect(result).toEqual(freshPoll);
        expect(mockedInitiate).toHaveBeenCalledWith(freshPoll.id, {
            forceRefetch: true,
            subscribe: false,
        });
    });

    test('falls back to cached poll data when the refetch resolves without a poll payload', async () => {
        const cachedPoll = createPoll('cached-after-empty-response');
        const dispatch = vi.fn(() => ({
            unwrap: async () => undefined,
        })) as never;

        mockedSelect.mockReturnValue(() => ({
            data: cachedPoll,
        }));

        const result = await fetchFreshPoll(dispatch, cachedPoll.id);

        expect(result).toEqual(cachedPoll);
    });

    test('falls back to the cached direct poll when the refetch fails', async () => {
        const cachedPoll = createPoll('cached-direct-poll');
        const expectedError = new Error('Network error');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw expectedError;
            },
        })) as never;

        mockedSelect.mockReturnValue(() => ({
            data: cachedPoll,
        }));

        const result = await fetchFreshPoll(dispatch, cachedPoll.id);

        expect(result).toEqual(cachedPoll);
    });

    test('falls back to a matching cached poll from another query state', async () => {
        const cachedPoll = createPoll('cached-query-poll');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw new Error('Network error');
            },
        })) as never;

        mockedGetState.mockReturnValue({
            polls: {
                queries: {
                    unrelated: {
                        endpointName: 'listPolls',
                        data: [createPoll('other-poll')],
                    },
                    cachedPollQuery: {
                        endpointName: 'getPoll',
                        data: cachedPoll,
                    },
                },
            },
        });

        const result = await fetchFreshPoll(dispatch, cachedPoll.id);

        expect(result).toEqual(cachedPoll);
    });

    test('rethrows the refetch error when no cached poll is available', async () => {
        const expectedError = new Error('Network error');
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw expectedError;
            },
        })) as never;

        await expect(fetchFreshPoll(dispatch, 'missing-poll')).rejects.toBe(
            expectedError,
        );
    });

    test('throws when the refetch resolves without a poll payload and no cached poll is available', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => undefined,
        })) as never;

        await expect(fetchFreshPoll(dispatch, 'missing-poll')).rejects.toThrow(
            'Poll missing-poll could not be fetched.',
        );
    });
});
