import type { EnhancedStore } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';

const mockedFetchFreshPoll = vi.fn();
const mockedRecoverSessionInitiate = vi.fn();
const mockedVote = vi.fn((payload: unknown) => ({
    payload,
    type: 'voting/vote',
}));

vi.mock('features/Polls/pollQuery', () => ({
    fetchFreshPoll: (...args: unknown[]) => mockedFetchFreshPoll(...args),
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
            getPoll: {
                matchFulfilled: () => false,
            },
            recoverSession: {
                initiate: (...args: unknown[]) =>
                    mockedRecoverSessionInitiate(...args),
            },
        },
    },
}));

vi.mock('./vote', () => ({
    vote: (payload: unknown) => mockedVote(payload),
}));

import { initialVoteState, votingSlice } from '../votingSlice';

import { recoverSession } from './recoverSession';

import type { VotingState } from 'features/Polls/votingState';

const createTestStore = (
    preloadedVotingState: VotingState,
): EnhancedStore<{ voting: VotingState }> =>
    configureStore({
        preloadedState: {
            voting: preloadedVotingState,
        },
        reducer: {
            voting: votingSlice.reducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
            }),
    });

describe('recoverSession thunk', () => {
    beforeEach(() => {
        mockedFetchFreshPoll.mockReset();
        mockedRecoverSessionInitiate.mockReset();
        mockedVote.mockClear();
    });

    it('reconciles persisted voter progress with server truth and refreshes the poll snapshot', async () => {
        const store = createTestStore({
            'poll-1': {
                ...initialVoteState,
                pollSlug: 'best-fruit--1111',
                selectedScores: { Apples: 7 },
                voterToken: 'voter-token',
            },
        });

        mockedRecoverSessionInitiate.mockReturnValue({
            type: 'recoverSession',
            unwrap: async () => ({
                role: 'voter',
                pollId: 'poll-1',
                pollSlug: 'best-fruit--1111',
                phase: 'decryption',
                isOpen: false,
                voterName: 'Alice',
                voterIndex: 1,
                hasSubmittedPublicKeyShare: true,
                hasSubmittedVote: true,
                hasSubmittedDecryptionShares: false,
                resultsAvailable: false,
            }),
        });
        mockedFetchFreshPoll.mockResolvedValue({
            id: 'poll-1',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: ['Alice', 'Bob'],
            isOpen: false,
            publicKeyShareCount: 2,
            encryptedVoteCount: 2,
            decryptionShareCount: 1,
            commonPublicKey: '33',
            encryptedTallies: [],
            publishedDecryptionShares: [],
            resultTallies: [],
            resultScores: [],
        });

        const result = store.dispatch(
            recoverSession({
                pollId: 'poll-1',
            }) as never,
        ) as {
            unwrap: () => Promise<void>;
        };

        await result.unwrap();

        expect(mockedRecoverSessionInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            recoveryData: {
                voterToken: 'voter-token',
            },
        });
        expect(mockedFetchFreshPoll).toHaveBeenCalledWith(
            expect.objectContaining({
                dispatch: expect.any(Function),
                getState: expect.any(Function),
                pollId: 'poll-1',
            }),
        );
        expect(mockedVote).toHaveBeenCalledWith({
            pollId: 'poll-1',
            voterName: 'Alice',
            selectedScores: { Apples: 7 },
        });
        expect(store.getState().voting['poll-1']).toEqual({
            ...initialVoteState,
            pollSlug: 'best-fruit--1111',
            pollSnapshot: {
                id: 'poll-1',
                slug: 'best-fruit--1111',
                pollName: 'Best fruit',
                createdAt: '2026-01-01T00:00:00.000Z',
                choices: ['Apples'],
                voters: ['Alice', 'Bob'],
                isOpen: false,
                publicKeyShareCount: 2,
                encryptedVoteCount: 2,
                decryptionShareCount: 1,
                commonPublicKey: '33',
                encryptedTallies: [],
                publishedDecryptionShares: [],
                resultTallies: [],
                resultScores: [],
            },
            selectedScores: { Apples: 7 },
            voterName: 'Alice',
            pendingVoterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
            shouldResumeWorkflow: true,
        });
    });

    it('does nothing when no recovery token is stored locally', async () => {
        const store = createTestStore({
            'poll-1': {
                ...initialVoteState,
            },
        });

        const result = store.dispatch(
            recoverSession({
                pollId: 'poll-1',
            }) as never,
        ) as {
            unwrap: () => Promise<void>;
        };

        await result.unwrap();

        expect(mockedRecoverSessionInitiate).not.toHaveBeenCalled();
        expect(mockedFetchFreshPoll).not.toHaveBeenCalled();
    });

    it('promotes a pending voter token after server recovery proves the voter session exists', async () => {
        const store = createTestStore({
            'poll-1': {
                ...initialVoteState,
                pendingVoterName: 'Alice',
                pendingVoterToken: 'pending-voter-token',
                selectedScores: { Apples: 7 },
            },
        });

        mockedRecoverSessionInitiate.mockReturnValue({
            type: 'recoverSession',
            unwrap: async () => ({
                role: 'voter',
                pollId: 'poll-1',
                pollSlug: 'best-fruit--1111',
                phase: 'voting',
                isOpen: false,
                voterName: 'Alice',
                voterIndex: 1,
                hasSubmittedPublicKeyShare: false,
                hasSubmittedVote: false,
                hasSubmittedDecryptionShares: false,
                resultsAvailable: false,
            }),
        });
        mockedFetchFreshPoll.mockResolvedValue({
            id: 'poll-1',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: ['Alice'],
            isOpen: false,
            publicKeyShareCount: 0,
            encryptedVoteCount: 0,
            decryptionShareCount: 0,
            commonPublicKey: null,
            encryptedTallies: [],
            publishedDecryptionShares: [],
            resultTallies: [],
            resultScores: [],
        });

        await (
            store.dispatch(
                recoverSession({
                    pollId: 'poll-1',
                }) as never,
            ) as { unwrap: () => Promise<void> }
        ).unwrap();

        expect(store.getState().voting['poll-1']).toEqual({
            ...initialVoteState,
            pollSlug: 'best-fruit--1111',
            pollSnapshot: {
                id: 'poll-1',
                slug: 'best-fruit--1111',
                pollName: 'Best fruit',
                createdAt: '2026-01-01T00:00:00.000Z',
                choices: ['Apples'],
                voters: ['Alice'],
                isOpen: false,
                publicKeyShareCount: 0,
                encryptedVoteCount: 0,
                decryptionShareCount: 0,
                commonPublicKey: null,
                encryptedTallies: [],
                publishedDecryptionShares: [],
                resultTallies: [],
                resultScores: [],
            },
            selectedScores: { Apples: 7 },
            voterName: 'Alice',
            pendingVoterName: 'Alice',
            voterIndex: 1,
            voterToken: 'pending-voter-token',
            hasSubmittedPublicKeyShare: false,
            hasSubmittedVote: false,
            hasSubmittedDecryptionShares: false,
            shouldResumeWorkflow: true,
        });
    });
});
