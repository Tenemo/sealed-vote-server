const mockedFetchFreshPoll = vi.fn();
const mockedWaitForPoll = vi.fn();
const mockedVoteInitiate = vi.fn();
const mockedSubmitDecryptionSharesInitiate = vi.fn();
const mockedSubmitPublicKeyShareInitiate = vi.fn();
const mockedSerializeVotes = vi.fn();
const mockedCreateDecryptionSharesForTallies = vi.fn();
const mockedCanSubmitDecryptionShares = vi.fn();
const mockedDerivePollPhase = vi.fn();
const mockedGenerateKeys = vi.fn();

vi.mock('@sealed-vote/protocol', () => ({
    canSubmitDecryptionShares: (...args: unknown[]) =>
        mockedCanSubmitDecryptionShares(...args),
    createDecryptionSharesForTallies: (...args: unknown[]) =>
        mockedCreateDecryptionSharesForTallies(...args),
    derivePollPhase: (...args: unknown[]) => mockedDerivePollPhase(...args),
    serializeVotes: (...args: unknown[]) => mockedSerializeVotes(...args),
}));

vi.mock('threshold-elgamal', () => ({
    generateKeys: (...args: unknown[]) => mockedGenerateKeys(...args),
}));

vi.mock('./pollQuery', () => ({
    fetchFreshPoll: (...args: unknown[]) => mockedFetchFreshPoll(...args),
    waitForPoll: (...args: unknown[]) => mockedWaitForPoll(...args),
}));

vi.mock('./pollsApi', () => ({
    pollsApi: {
        endpoints: {
            submitPublicKeyShare: {
                initiate: (...args: unknown[]) =>
                    mockedSubmitPublicKeyShareInitiate(...args),
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

import {
    setKeys,
    setProgressMessage,
    setSubmissionStatus,
    upsertPollSnapshot,
} from './votingSlice';
import { initialVoteState } from './votingState';
import type { VotingState } from './votingState';
import {
    runDecryptResults,
    runEncryptVotesGenerateShares,
    runProcessPublicPrivateKeys,
} from './votingWorkflow';

const actions = {
    setKeys,
    setProgressMessage,
    setSubmissionStatus,
    upsertPollSnapshot,
};

const basePoll = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'best-fruit--1111',
    pollName: 'Best fruit',
    createdAt: '2026-01-01T00:00:00.000Z',
    choices: ['Apples', 'Bananas'],
    voters: ['Alice', 'Bob'],
    isOpen: false,
    publicKeyShareCount: 0,
    commonPublicKey: null,
    encryptedVoteCount: 0,
    encryptedTallies: [],
    decryptionShareCount: 0,
    publishedDecryptionShares: [],
    resultTallies: [],
    resultScores: [],
};

const connectionError = {
    error: 'TypeError: Failed to fetch',
    status: 'FETCH_ERROR',
};

const createVotingState = (
    overrides: Partial<VotingState[string]> = {},
): VotingState => ({
    'poll-1': {
        ...initialVoteState,
        privateKey: '11',
        publicKey: null,
        selectedScores: { Apples: 7, Bananas: 4 },
        voterIndex: 1,
        voterName: 'Alice',
        voterToken: 'voter-token',
        ...overrides,
    },
});

describe('voting workflow', () => {
    beforeEach(() => {
        mockedFetchFreshPoll.mockReset();
        mockedWaitForPoll.mockReset();
        mockedVoteInitiate.mockReset();
        mockedSubmitDecryptionSharesInitiate.mockReset();
        mockedSubmitPublicKeyShareInitiate.mockReset();
        mockedSerializeVotes.mockReset();
        mockedCreateDecryptionSharesForTallies.mockReset();
        mockedCanSubmitDecryptionShares.mockReset();
        mockedDerivePollPhase.mockReset();
        mockedGenerateKeys.mockReset();

        mockedVoteInitiate.mockReturnValue({
            unwrap: async () => undefined,
        });
        mockedSubmitDecryptionSharesInitiate.mockReturnValue({
            unwrap: async () => undefined,
        });
        mockedSubmitPublicKeyShareInitiate.mockReturnValue({
            unwrap: async () => undefined,
        });
    });

    it('returns early when keys and the common public key are already available', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState({
            pollSnapshot: {
                ...basePoll,
                commonPublicKey: '33',
            },
            privateKey: '11',
            publicKey: '22',
        });

        await runProcessPublicPrivateKeys({
            actions,
            dispatch,
            getState: (() => ({ voting: state })) as never,
            pollId: 'poll-1',
        });

        expect(dispatch).not.toHaveBeenCalled();
        expect(mockedFetchFreshPoll).not.toHaveBeenCalled();
        expect(mockedSubmitPublicKeyShareInitiate).not.toHaveBeenCalled();
    });

    it('waits for registration to finish, submits a public key share, and stores the common key snapshot', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState({
            privateKey: null,
            publicKey: null,
        });
        const postRegistrationPoll = {
            ...basePoll,
            isOpen: false,
        };
        const pollWithCommonKey = {
            ...basePoll,
            commonPublicKey: '33',
            publicKeyShareCount: 2,
        };

        mockedFetchFreshPoll.mockResolvedValue({
            ...basePoll,
            isOpen: true,
        });
        mockedDerivePollPhase.mockReturnValueOnce('registration');
        mockedWaitForPoll
            .mockResolvedValueOnce(postRegistrationPoll)
            .mockResolvedValueOnce(pollWithCommonKey);
        mockedGenerateKeys.mockReturnValue({
            privateKey: 55n,
            publicKey: 44n,
        });

        await runProcessPublicPrivateKeys({
            actions,
            dispatch,
            getState: (() => ({ voting: state })) as never,
            pollId: 'poll-1',
        });

        expect(mockedGenerateKeys).toHaveBeenCalledWith(1, 2);
        expect(mockedSubmitPublicKeyShareInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            publicKeyShareData: {
                publicKeyShare: '44',
                voterToken: 'voter-token',
            },
        });
        expect(dispatch).toHaveBeenCalledWith(
            setKeys({
                pollId: 'poll-1',
                privateKey: '55',
                publicKey: '44',
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            setSubmissionStatus({
                pollId: 'poll-1',
                phase: 'publicKey',
                submitted: true,
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            upsertPollSnapshot({
                pollId: 'poll-1',
                poll: pollWithCommonKey,
            }),
        );
    });

    it('rethrows connection failures during public key processing without wrapping them', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState({
            privateKey: null,
            publicKey: null,
        });

        mockedFetchFreshPoll.mockRejectedValue(connectionError);

        await expect(
            runProcessPublicPrivateKeys({
                actions,
                dispatch,
                getState: (() => ({ voting: state })) as never,
                pollId: 'poll-1',
            }),
        ).rejects.toBe(connectionError);
    });

    it('wraps non-network failures during public key processing with workflow context', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState({
            voterIndex: null,
            voterName: null,
            voterToken: null,
            privateKey: null,
            publicKey: null,
        });

        mockedFetchFreshPoll.mockResolvedValue(basePoll);
        mockedDerivePollPhase.mockReturnValueOnce('key-generation');

        await expect(
            runProcessPublicPrivateKeys({
                actions,
                dispatch,
                getState: (() => ({ voting: state })) as never,
                pollId: 'poll-1',
            }),
        ).rejects.toThrow(
            'Failed during public/private key processing: Voter registration is missing.',
        );
    });

    it('includes the voter token in vote and decryption share submissions', async () => {
        const state = createVotingState();
        const dispatch = vi.fn((action: unknown) => action) as never;

        mockedFetchFreshPoll.mockResolvedValue({
            ...basePoll,
            commonPublicKey: '33',
        });
        mockedWaitForPoll.mockResolvedValue({
            ...basePoll,
            commonPublicKey: '33',
            encryptedVoteCount: 1,
            encryptedTallies: [{ c1: '9', c2: '8' }],
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
            actions,
            dispatch,
            getState: (() => ({ voting: state })) as never,
            pollId: 'poll-1',
        });

        expect(mockedFetchFreshPoll).toHaveBeenCalledWith({
            dispatch,
            getState: expect.any(Function),
            pollId: 'poll-1',
        });
        expect(mockedSerializeVotes).toHaveBeenCalledWith(
            { Apples: 7, Bananas: 4 },
            ['Apples', 'Bananas'],
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

    it('wraps decryption-share generation failures with workflow context', async () => {
        const state = createVotingState();
        const dispatch = vi.fn((action: unknown) => action) as never;

        mockedFetchFreshPoll.mockResolvedValue({
            ...basePoll,
            commonPublicKey: '33',
            encryptedTallies: [{ c1: '9', c2: '8' }],
        });
        mockedSerializeVotes.mockReturnValue([{ c1: '1', c2: '2' }]);
        mockedCanSubmitDecryptionShares.mockReturnValue(true);
        mockedCreateDecryptionSharesForTallies.mockImplementation(() => {
            throw new Error('broken tally payload');
        });

        await expect(
            runEncryptVotesGenerateShares({
                actions,
                dispatch,
                getState: (() => ({ voting: state })) as never,
                pollId: 'poll-1',
            }),
        ).rejects.toThrow(
            'Failed during vote encryption/decryption-share flow: Failed to generate decryption shares: broken tally payload',
        );
    });

    it('rethrows connection failures during vote submission without wrapping them', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState();

        mockedFetchFreshPoll.mockRejectedValue(connectionError);

        await expect(
            runEncryptVotesGenerateShares({
                actions,
                dispatch,
                getState: (() => ({ voting: state })) as never,
                pollId: 'poll-1',
            }),
        ).rejects.toBe(connectionError);
    });

    it('waits for completed results and stores the final poll snapshot', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState();
        const completedPoll = {
            ...basePoll,
            commonPublicKey: '33',
            encryptedTallies: [{ c1: '1', c2: '2' }],
            publishedDecryptionShares: [['share-1']],
            resultTallies: ['49'],
            resultScores: [7],
        };

        mockedWaitForPoll.mockResolvedValue(completedPoll);

        await runDecryptResults({
            actions,
            dispatch,
            getState: (() => ({ voting: state })) as never,
            pollId: 'poll-1',
        });

        expect(dispatch).toHaveBeenCalledWith(
            setProgressMessage({
                pollId: 'poll-1',
                progressMessage:
                    'Waiting for all decryption shares and results...',
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            upsertPollSnapshot({
                pollId: 'poll-1',
                poll: completedPoll,
            }),
        );
    });

    it('wraps non-network failures while waiting for final results', async () => {
        const dispatch = vi.fn((action: unknown) => action) as never;
        const state = createVotingState();

        mockedWaitForPoll.mockRejectedValue(new Error('timed out'));

        await expect(
            runDecryptResults({
                actions,
                dispatch,
                getState: (() => ({ voting: state })) as never,
                pollId: 'poll-1',
            }),
        ).rejects.toThrow('Failed during result decryption wait: timed out');
    });
});
