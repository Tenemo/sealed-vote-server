import type { EnhancedStore } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';

const mockedFetchFreshPoll = vi.fn();
const mockedWaitForPoll = vi.fn();
const mockedVoteInitiate = vi.fn();
const mockedSubmitDecryptionSharesInitiate = vi.fn();
const mockedSerializeVotes = vi.fn();
const mockedCreateDecryptionSharesForTallies = vi.fn();
const mockedCanSubmitDecryptionShares = vi.fn();

vi.mock('@sealed-vote/protocol', () => ({
    canSubmitDecryptionShares: (...args: unknown[]) =>
        mockedCanSubmitDecryptionShares(...args),
    createDecryptionSharesForTallies: (...args: unknown[]) =>
        mockedCreateDecryptionSharesForTallies(...args),
    serializeVotes: (...args: unknown[]) => mockedSerializeVotes(...args),
}));

vi.mock('features/Polls/pollQuery', () => ({
    fetchFreshPoll: (...args: unknown[]) => mockedFetchFreshPoll(...args),
    waitForPoll: (...args: unknown[]) => mockedWaitForPoll(...args),
}));

vi.mock('features/Polls/pollsApi', () => ({
    pollsApi: {
        reducerPath: 'polls',
        reducer: (state = {}) => state,
        middleware:
            () => (next: (action: unknown) => unknown) => (action: unknown) =>
                next(action),
        endpoints: {
            createPoll: {
                matchFulfilled: () => false,
            },
            registerVoter: {
                matchFulfilled: () => false,
            },
            vote: {
                initiate: (...args: unknown[]) => mockedVoteInitiate(...args),
            },
            submitDecryptionShares: {
                initiate: (...args: unknown[]) =>
                    mockedSubmitDecryptionSharesInitiate(...args),
            },
            submitPublicKeyShare: {
                initiate: vi.fn(),
            },
            getPoll: {
                select: () => () => ({}),
            },
        },
    },
}));

import { encryptVotesGenerateShares } from './encryptVotesGenerateShares';

import { initialVoteState, votingSlice } from 'features/Polls/votingSlice';
import type { VotingState } from 'features/Polls/votingState';

const createTestStore = (
    votingState: VotingState,
): EnhancedStore<{ voting: VotingState }> =>
    configureStore({
        reducer: {
            voting: votingSlice.reducer,
        },
        preloadedState: {
            voting: votingState,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
            }),
    });

describe('encryptVotesGenerateShares thunk', () => {
    beforeEach(() => {
        mockedFetchFreshPoll.mockReset();
        mockedWaitForPoll.mockReset();
        mockedVoteInitiate.mockReset();
        mockedSubmitDecryptionSharesInitiate.mockReset();
        mockedSerializeVotes.mockReset();
        mockedCreateDecryptionSharesForTallies.mockReset();
        mockedCanSubmitDecryptionShares.mockReset();
    });

    it('includes the voter token in vote and decryption share submissions', async () => {
        const store = createTestStore({
            'poll-1': {
                ...initialVoteState,
                selectedScores: { Apples: 7 },
                commonPublicKey: '33',
                privateKey: '11',
                voterToken: 'voter-token',
            },
        });

        mockedFetchFreshPoll.mockResolvedValue({
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
        });
        mockedWaitForPoll.mockResolvedValue({
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
        });
        mockedVoteInitiate.mockReturnValue({
            type: 'submitVote',
            unwrap: async () => undefined,
        });
        mockedSubmitDecryptionSharesInitiate.mockReturnValue({
            type: 'submitDecryptionShares',
            unwrap: async () => undefined,
        });
        mockedSerializeVotes.mockReturnValue([{ c1: '1', c2: '2' }]);
        mockedCreateDecryptionSharesForTallies.mockReturnValue(['share-1']);
        mockedCanSubmitDecryptionShares.mockReturnValue(false);

        const encryptResult = store.dispatch(
            encryptVotesGenerateShares({ pollId: 'poll-1' }) as never,
        ) as {
            unwrap: () => Promise<void>;
        };

        await encryptResult.unwrap();

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
