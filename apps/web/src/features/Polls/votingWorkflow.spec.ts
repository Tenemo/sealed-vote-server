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

import {
    setKeys,
    setProgressMessage,
    setSubmissionStatus,
    upsertPollSnapshot,
} from './votingSlice';
import { initialVoteState } from './votingState';
import type { VotingState } from './votingState';
import { runEncryptVotesGenerateShares } from './votingWorkflow';

const createVotingState = (
    overrides: Partial<VotingState[string]> = {},
): VotingState => ({
    'poll-1': {
        ...initialVoteState,
        selectedScores: { Apples: 7 },
        privateKey: '11',
        voterToken: 'voter-token',
        ...overrides,
    },
});

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
        const dispatch = vi.fn((action: unknown) => action) as never;
        const actions = {
            setKeys,
            setProgressMessage,
            setSubmissionStatus,
            upsertPollSnapshot,
        };

        mockedFetchFreshPoll.mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: ['Alice'],
            isOpen: false,
            publicKeyShareCount: 1,
            commonPublicKey: '33',
            encryptedVoteCount: 0,
            encryptedTallies: [],
            decryptionShareCount: 0,
            publishedDecryptionShares: [],
            resultTallies: [],
            resultScores: [],
        });
        mockedWaitForPoll.mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples'],
            voters: ['Alice'],
            isOpen: false,
            publicKeyShareCount: 1,
            commonPublicKey: '33',
            encryptedVoteCount: 1,
            encryptedTallies: [{ c1: '9', c2: '8' }],
            decryptionShareCount: 0,
            publishedDecryptionShares: [],
            resultTallies: [],
            resultScores: [],
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
            getState: (() => ({ voting: state })) as never,
            actions,
        });

        expect(mockedFetchFreshPoll).toHaveBeenCalledWith({
            dispatch,
            getState: expect.any(Function),
            pollId: 'poll-1',
        });
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
