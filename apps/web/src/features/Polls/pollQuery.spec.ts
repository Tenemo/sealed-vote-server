import { fetchFreshPoll, waitForPoll } from './pollQuery';

const basePoll = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'best-fruit--1111',
    pollName: 'Best fruit',
    createdAt: '2026-01-01T00:00:00.000Z',
    choices: ['Apples', 'Bananas'],
    voters: ['Alice'],
    isOpen: true,
    publicKeyShareCount: 0,
    commonPublicKey: null,
    encryptedVoteCount: 0,
    encryptedTallies: [],
    decryptionShareCount: 0,
    publishedDecryptionShares: [],
    resultTallies: [],
    resultScores: [],
};

describe('poll query helpers', () => {
    it('returns the persisted poll snapshot on transient fetch errors', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw {
                    error: 'TypeError: Failed to fetch',
                    status: 'FETCH_ERROR',
                };
            },
        }));

        const result = await fetchFreshPoll({
            dispatch: dispatch as never,
            getState: () =>
                ({
                    polls: {
                        queries: {},
                    },
                    voting: {
                        '11111111-1111-4111-8111-111111111111': {
                            pollSnapshot: basePoll,
                        },
                    },
                }) as never,
            pollId: '11111111-1111-4111-8111-111111111111',
        });

        expect(result).toEqual(basePoll);
    });

    it('does not hide non-connection errors behind stale persisted state', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw {
                    data: {
                        message: 'Poll does not exist.',
                    },
                    status: 404,
                };
            },
        }));

        await expect(
            fetchFreshPoll({
                dispatch: dispatch as never,
                getState: () =>
                    ({
                        polls: {
                            queries: {},
                        },
                        voting: {
                            '11111111-1111-4111-8111-111111111111': {
                                pollSnapshot: basePoll,
                            },
                        },
                    }) as never,
                pollId: '11111111-1111-4111-8111-111111111111',
            }),
        ).rejects.toEqual({
            data: {
                message: 'Poll does not exist.',
            },
            status: 404,
        });
    });

    it('returns a cached or persisted poll while waiting when the network is down', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw {
                    error: 'TypeError: Failed to fetch',
                    status: 'FETCH_ERROR',
                };
            },
        }));

        const result = await waitForPoll({
            dispatch: dispatch as never,
            getState: () =>
                ({
                    polls: {
                        queries: {},
                    },
                    voting: {
                        '11111111-1111-4111-8111-111111111111': {
                            pollSnapshot: basePoll,
                        },
                    },
                }) as never,
            pollId: '11111111-1111-4111-8111-111111111111',
            predicate: (currentPoll) => currentPoll.slug === 'best-fruit--1111',
        });

        expect(result).toEqual(basePoll);
        expect(dispatch).toHaveBeenCalled();
    });
});
