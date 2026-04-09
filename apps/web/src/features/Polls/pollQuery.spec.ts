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
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns a freshly fetched poll when the payload matches the requested id', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => basePoll,
        }));

        await expect(
            fetchFreshPoll({
                dispatch: dispatch as never,
                getState: () =>
                    ({
                        polls: {
                            queries: {},
                        },
                        voting: {},
                    }) as never,
                pollId: basePoll.id,
            }),
        ).resolves.toEqual(basePoll);
    });

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

    it('rejects mismatched poll payloads instead of treating them as a successful fetch', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => ({
                ...basePoll,
                id: '22222222-2222-4222-8222-222222222222',
            }),
        }));

        await expect(
            fetchFreshPoll({
                dispatch: dispatch as never,
                getState: () =>
                    ({
                        polls: {
                            queries: {},
                        },
                        voting: {},
                    }) as never,
                pollId: basePoll.id,
            }),
        ).rejects.toThrow(`Poll ${basePoll.id} could not be fetched.`);
    });

    it('rejects immediately with an abort error when waiting starts with an aborted signal', async () => {
        const controller = new AbortController();
        const dispatch = vi.fn();

        controller.abort();

        await expect(
            waitForPoll({
                dispatch: dispatch as never,
                getState: () =>
                    ({
                        polls: {
                            queries: {},
                        },
                        voting: {},
                    }) as never,
                pollId: basePoll.id,
                predicate: () => false,
                signal: controller.signal,
            }),
        ).rejects.toMatchObject({
            message: 'Poll query aborted.',
            name: 'AbortError',
        });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('keeps polling until the predicate matches a later successful refresh', async () => {
        vi.useFakeTimers();

        const dispatch = vi
            .fn()
            .mockReturnValueOnce({
                unwrap: async () => ({
                    ...basePoll,
                    commonPublicKey: null,
                }),
            })
            .mockReturnValueOnce({
                unwrap: async () => ({
                    ...basePoll,
                    commonPublicKey: '33',
                }),
            });

        const pollPromise = waitForPoll({
            dispatch: dispatch as never,
            getState: () =>
                ({
                    polls: {
                        queries: {},
                    },
                    voting: {},
                }) as never,
            pollId: basePoll.id,
            predicate: (poll) => Boolean(poll.commonPublicKey),
        });

        await Promise.resolve();
        expect(dispatch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5000);

        await expect(pollPromise).resolves.toEqual({
            ...basePoll,
            commonPublicKey: '33',
        });
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it('rethrows non-transient polling failures instead of retrying forever', async () => {
        const dispatch = vi.fn(() => ({
            unwrap: async () => {
                throw new Error('backend exploded');
            },
        }));

        await expect(
            waitForPoll({
                dispatch: dispatch as never,
                getState: () =>
                    ({
                        polls: {
                            queries: {},
                        },
                        voting: {},
                    }) as never,
                pollId: basePoll.id,
                predicate: () => false,
            }),
        ).rejects.toThrow('backend exploded');
        expect(dispatch).toHaveBeenCalledTimes(1);
    });
});
