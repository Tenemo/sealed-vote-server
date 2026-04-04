const mockedGetPollInitiate = jest.fn();
const mockedVoteInitiate = jest.fn();
const mockedSubmitDecryptionSharesInitiate = jest.fn();
const mockedSerializeVotes = jest.fn();
const mockedCreateDecryptionSharesForTallies = jest.fn();
const mockedCanSubmitDecryptionShares = jest.fn();

jest.mock('@sealed-vote/protocol', () => ({
    canSubmitDecryptionShares: (...args: unknown[]) =>
        mockedCanSubmitDecryptionShares(...args),
    createDecryptionSharesForTallies: (...args: unknown[]) =>
        mockedCreateDecryptionSharesForTallies(...args),
    serializeVotes: (...args: unknown[]) => mockedSerializeVotes(...args),
}));

jest.mock('features/Polls/pollsApi', () => ({
    pollsApi: {
        endpoints: {
            getPollSkipCache: {
                initiate: (...args: unknown[]) =>
                    mockedGetPollInitiate(...args),
            },
            vote: {
                initiate: (...args: unknown[]) => mockedVoteInitiate(...args),
            },
            submitDecryptionShares: {
                initiate: (...args: unknown[]) =>
                    mockedSubmitDecryptionSharesInitiate(...args),
            },
        },
    },
}));

import { encryptVotesGenerateShares } from './encryptVotesGenerateShares';

import { initialVoteState } from 'features/Polls/votingSlice';

describe('encryptVotesGenerateShares thunk', () => {
    beforeEach(() => {
        mockedGetPollInitiate.mockReset();
        mockedVoteInitiate.mockReset();
        mockedSubmitDecryptionSharesInitiate.mockReset();
        mockedSerializeVotes.mockReset();
        mockedCreateDecryptionSharesForTallies.mockReset();
        mockedCanSubmitDecryptionShares.mockReset();
    });

    it('includes the voter token in vote and decryption share submissions', async () => {
        mockedGetPollInitiate.mockReturnValue({ type: 'getPoll' });
        mockedVoteInitiate.mockReturnValue({ type: 'submitVote' });
        mockedSubmitDecryptionSharesInitiate.mockReturnValue({
            type: 'submitDecryptionShares',
        });
        mockedSerializeVotes.mockReturnValue([{ c1: '1', c2: '2' }]);
        mockedCreateDecryptionSharesForTallies.mockReturnValue(['share-1']);
        mockedCanSubmitDecryptionShares.mockImplementation(
            (poll) => poll.encryptedTallies.length > 0,
        );

        let pollFetchCount = 0;
        const dispatch = jest.fn((action) => {
            switch (action.type) {
                case 'getPoll':
                    pollFetchCount += 1;
                    return {
                        unwrap: async () =>
                            pollFetchCount === 1
                                ? {
                                      pollName: 'Best fruit',
                                      createdAt: '2026-01-01T00:00:00.000Z',
                                      choices: ['Apples'],
                                      voters: ['Alice'],
                                      isOpen: false,
                                      publicKeyShares: ['pk-1'],
                                      commonPublicKey: '33',
                                      encryptedVotes: [],
                                      encryptedTallies: [],
                                      decryptionShares: [],
                                      results: [],
                                  }
                                : {
                                      pollName: 'Best fruit',
                                      createdAt: '2026-01-01T00:00:00.000Z',
                                      choices: ['Apples'],
                                      voters: ['Alice'],
                                      isOpen: false,
                                      publicKeyShares: ['pk-1'],
                                      commonPublicKey: '33',
                                      encryptedVotes: [[{ c1: '1', c2: '2' }]],
                                      encryptedTallies: [{ c1: '9', c2: '8' }],
                                      decryptionShares: [],
                                      results: [],
                                  },
                    };
                case 'submitVote':
                case 'submitDecryptionShares':
                    return {
                        unwrap: async () => undefined,
                    };
                default:
                    return action;
            }
        });

        await encryptVotesGenerateShares({ pollId: 'poll-1' })(
            dispatch as never,
            (() => ({
                voting: {
                    'poll-1': {
                        ...initialVoteState,
                        selectedScores: { Apples: 7 },
                        commonPublicKey: '33',
                        privateKey: '11',
                        voterToken: 'voter-token',
                    },
                },
            })) as never,
            undefined,
        );

        expect(mockedSerializeVotes).toHaveBeenCalledWith(
            { Apples: 7 },
            ['Apples'],
            33n,
        );
        expect(mockedVoteInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            voteData: {
                votes: [{ c1: '1', c2: '2' }],
                voterToken: 'voter-token',
            },
        });
        expect(mockedSubmitDecryptionSharesInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            decryptionSharesData: {
                decryptionShares: ['share-1'],
                voterToken: 'voter-token',
            },
        });
    });
});
