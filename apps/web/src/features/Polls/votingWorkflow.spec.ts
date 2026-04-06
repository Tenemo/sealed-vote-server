import type { UnknownAction } from '@reduxjs/toolkit';

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

vi.mock('./pollQuery', () => ({
    fetchFreshPoll: (...args: unknown[]) => mockedFetchFreshPoll(...args),
    waitForPoll: (...args: unknown[]) => mockedWaitForPoll(...args),
}));

vi.mock('./pollsApi', () => ({
    pollsApi: {
        endpoints: {
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

import { initialVoteState } from './votingState';
import type { VotingState } from './votingState';
import { runEncryptVotesGenerateShares } from './votingWorkflow';

const createVotingState = (
    overrides: Partial<VotingState[string]> = {},
): VotingState => ({
    'poll-1': {
        ...initialVoteState,
        selectedScores: { Apples: 7 },
        commonPublicKey: '33',
        privateKey: '11',
        voterToken: 'voter-token',
        ...overrides,
    },
});

const createMockAction = (type: string, payload: unknown): UnknownAction =>
    ({ type, payload }) as UnknownAction;

describe('runEncryptVotesGenerateShares', () => {
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
        const state = createVotingState();
        const dispatch = vi.fn((action: unknown) => action);
        const actions = {
            setKeys: vi.fn(
                (payload: unknown): UnknownAction =>
                    createMockAction('setKeys', payload),
            ),
            setProgressMessage: vi.fn(
                (payload: unknown): UnknownAction =>
                    createMockAction('setProgressMessage', payload),
            ),
            setResults: vi.fn(
                (payload: unknown): UnknownAction =>
                    createMockAction('setResults', payload),
            ),
            setSubmissionStatus: vi.fn(
                (payload: unknown): UnknownAction =>
                    createMockAction('setSubmissionStatus', payload),
            ),
        };

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
            unwrap: async () => undefined,
        });
        mockedSubmitDecryptionSharesInitiate.mockReturnValue({
            unwrap: async () => undefined,
        });
        mockedSerializeVotes.mockReturnValue([{ c1: '1', c2: '2' }]);
        mockedCreateDecryptionSharesForTallies.mockReturnValue(['share-1']);
        mockedCanSubmitDecryptionShares.mockReturnValue(false);

        await runEncryptVotesGenerateShares({
            pollId: 'poll-1',
            dispatch,
            getState: () => ({ voting: state }),
            actions,
        });

        expect(mockedFetchFreshPoll).toHaveBeenCalledWith(dispatch, 'poll-1');
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
