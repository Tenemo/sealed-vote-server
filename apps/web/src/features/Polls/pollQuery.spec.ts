import { waitForPoll } from './pollQuery';

describe('waitForPoll', () => {
    it('returns a cached or persisted poll immediately when it already matches', async () => {
        const dispatch = vi.fn();
        const poll = {
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

        const result = await waitForPoll({
            dispatch,
            getState: () =>
                ({
                    polls: {
                        queries: {},
                    },
                    voting: {
                        '11111111-1111-4111-8111-111111111111': {
                            pollSnapshot: poll,
                        },
                    },
                }) as never,
            pollId: '11111111-1111-4111-8111-111111111111',
            predicate: (currentPoll) => currentPoll.slug === 'best-fruit--1111',
        });

        expect(result).toEqual(poll);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
