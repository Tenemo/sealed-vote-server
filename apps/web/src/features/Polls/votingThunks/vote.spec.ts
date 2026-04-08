import type { EnhancedStore } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';

const mockedCanRegister = vi.fn();
const mockedFetchFreshPoll = vi.fn();
const mockedGenerateClientToken = vi.fn();
const mockedRegisterVoterInitiate = vi.fn();
const mockedRunProcessPublicPrivateKeys = vi.fn();
const mockedRunEncryptVotesGenerateShares = vi.fn();
const mockedRunDecryptResults = vi.fn();

vi.mock('@sealed-vote/protocol', () => ({
    canRegister: (...args: unknown[]) => mockedCanRegister(...args),
}));

vi.mock('features/Polls/pollQuery', () => ({
    fetchFreshPoll: (...args: unknown[]) => mockedFetchFreshPoll(...args),
    waitForPoll: vi.fn(),
}));

vi.mock('../clientToken', () => ({
    generateClientToken: () => mockedGenerateClientToken(),
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
            registerVoter: {
                initiate: (...args: unknown[]) =>
                    mockedRegisterVoterInitiate(...args),
                matchFulfilled: () => false,
            },
        },
    },
}));

vi.mock('../votingWorkflow', () => ({
    runProcessPublicPrivateKeys: (...args: unknown[]) =>
        mockedRunProcessPublicPrivateKeys(...args),
    runEncryptVotesGenerateShares: (...args: unknown[]) =>
        mockedRunEncryptVotesGenerateShares(...args),
    runDecryptResults: (...args: unknown[]) => mockedRunDecryptResults(...args),
}));

import { initialVoteState, votingSlice } from '../votingSlice';

import { vote } from './vote';

import type { VotingState } from 'features/Polls/votingState';
import { reconnectingWorkflowMessage } from 'utils/utils';

const createTestStore = (): EnhancedStore<{ voting: VotingState }> =>
    configureStore({
        reducer: {
            voting: votingSlice.reducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
            }),
    });

describe('vote thunk', () => {
    beforeEach(() => {
        mockedCanRegister.mockReset();
        mockedFetchFreshPoll.mockReset();
        mockedGenerateClientToken.mockReset();
        mockedRegisterVoterInitiate.mockReset();
        mockedRunProcessPublicPrivateKeys.mockReset();
        mockedRunEncryptVotesGenerateShares.mockReset();
        mockedRunDecryptResults.mockReset();
        mockedGenerateClientToken.mockReturnValue('generated-voter-token');
    });

    it('stores voter registration data and runs the voting workflow', async () => {
        const selectedScores = { Apples: 7 };
        const store = createTestStore();
        const registerPayload = {
            message: 'Registered successfully',
            pollId: 'poll-1',
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
        };

        mockedCanRegister.mockReturnValue(true);
        mockedFetchFreshPoll.mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: [],
            isOpen: true,
            publicKeyShareCount: 0,
            encryptedVoteCount: 0,
            decryptionShareCount: 0,
            commonPublicKey: null,
            encryptedTallies: [],
            results: [],
        });
        mockedRegisterVoterInitiate.mockReturnValue({
            type: 'registerVoter',
            unwrap: async () => registerPayload,
            then: (
                resolve: (value: typeof registerPayload) => unknown,
            ): Promise<unknown> => Promise.resolve(resolve(registerPayload)),
        });
        mockedRunProcessPublicPrivateKeys.mockResolvedValue(undefined);
        mockedRunEncryptVotesGenerateShares.mockResolvedValue(undefined);
        mockedRunDecryptResults.mockResolvedValue(undefined);

        const voteResult = store.dispatch(
            vote({
                pollId: 'poll-1',
                voterName: 'Alice',
                selectedScores,
            }) as never,
        ) as {
            unwrap: () => Promise<void>;
        };

        await voteResult.unwrap();

        expect(mockedFetchFreshPoll).toHaveBeenCalledWith(
            expect.any(Function),
            'poll-1',
        );
        expect(mockedRegisterVoterInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            voterData: {
                voterName: 'Alice',
                voterToken: 'generated-voter-token',
            },
        });
        expect(mockedRunProcessPublicPrivateKeys).toHaveBeenCalled();
        expect(mockedRunEncryptVotesGenerateShares).toHaveBeenCalled();
        expect(mockedRunDecryptResults).toHaveBeenCalled();
        expect(store.getState().voting['poll-1']).toEqual({
            ...initialVoteState,
            lastUpdatedAt: expect.any(Number),
            pendingVoterName: 'Alice',
            selectedScores,
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            isVotingInProgress: false,
            progressMessage: null,
        });
    });

    it('marks the workflow for reconnect-driven resume after a connection failure', async () => {
        const selectedScores = { Apples: 7 };
        const store = createTestStore();
        const registerPayload = {
            message: 'Registered successfully',
            pollId: 'poll-1',
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
        };

        mockedCanRegister.mockReturnValue(true);
        mockedFetchFreshPoll.mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: [],
            isOpen: true,
            publicKeyShareCount: 0,
            encryptedVoteCount: 0,
            decryptionShareCount: 0,
            commonPublicKey: null,
            encryptedTallies: [],
            results: [],
        });
        mockedRegisterVoterInitiate.mockReturnValue({
            type: 'registerVoter',
            unwrap: async () => registerPayload,
            then: (
                resolve: (value: typeof registerPayload) => unknown,
            ): Promise<unknown> => Promise.resolve(resolve(registerPayload)),
        });
        mockedRunProcessPublicPrivateKeys.mockRejectedValue(
            new Error('TypeError: Failed to fetch'),
        );

        await store.dispatch(
            vote({
                pollId: 'poll-1',
                voterName: 'Alice',
                selectedScores,
            }) as never,
        );

        expect(store.getState().voting['poll-1']).toEqual({
            ...initialVoteState,
            lastUpdatedAt: expect.any(Number),
            pendingVoterName: 'Alice',
            selectedScores,
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            isVotingInProgress: false,
            progressMessage: reconnectingWorkflowMessage,
            shouldResumeWorkflow: true,
        });
    });
});
