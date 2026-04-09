import {
    applyRecoveredSession,
    initialVoteState,
    setPendingVoterRegistration,
    upsertPollSnapshot,
    sanitizeVotingStateForPersistence,
    votingSlice,
} from './votingSlice';
import type { VotingState } from './votingState';
import { voteThunkTypePrefix } from './votingThunks/voteTypes';

const basePoll = {
    id: 'poll-1',
    slug: 'poll-1--1234',
    pollName: 'Poll 1',
    createdAt: '2026-01-01T00:00:00.000Z',
    choices: ['Apples'],
    voters: ['Alice'],
    isOpen: false,
    publicKeyShareCount: 1,
    commonPublicKey: '33',
    encryptedVoteCount: 1,
    encryptedTallies: [{ c1: '1', c2: '2' }],
    decryptionShareCount: 1,
    publishedDecryptionShares: [],
    resultTallies: [],
    resultScores: [],
};

const reduce = (
    state: VotingState | undefined,
    action: Parameters<typeof votingSlice.reducer>[1],
): VotingState => votingSlice.reducer(state, action);

describe('sanitizeVotingStateForPersistence', () => {
    it('clears transient flags for active voting sessions', () => {
        const sanitizedState = sanitizeVotingStateForPersistence({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
                pendingVoterName: 'Alice',
                pendingVoterToken: 'pending-token',
                selectedScores: {
                    Apples: 7,
                },
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
                isVotingInProgress: true,
                progressMessage: 'Waiting for common public key...',
                shouldResumeWorkflow: true,
                privateKey: '11',
                publicKey: '22',
                hasSubmittedPublicKeyShare: true,
                hasSubmittedVote: true,
                hasSubmittedDecryptionShares: false,
            },
        });

        expect(sanitizedState['poll-1']).toEqual({
            ...initialVoteState,
            creatorToken: 'creator-token',
            pendingVoterName: 'Alice',
            pendingVoterToken: 'pending-token',
            selectedScores: {
                Apples: 7,
            },
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            isVotingInProgress: false,
            progressMessage: null,
            shouldResumeWorkflow: true,
            privateKey: '11',
            publicKey: '22',
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
        });
    });

    it('removes completed-session secrets from persisted storage', () => {
        const sanitizedState = sanitizeVotingStateForPersistence({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
                pendingVoterName: 'Alice',
                pendingVoterToken: 'pending-token',
                selectedScores: {
                    Apples: 7,
                },
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
                isVotingInProgress: true,
                progressMessage: 'Waiting for common public key...',
                shouldResumeWorkflow: true,
                privateKey: '11',
                publicKey: '22',
                hasSubmittedPublicKeyShare: true,
                hasSubmittedVote: true,
                hasSubmittedDecryptionShares: false,
                pollSnapshot: {
                    id: 'poll-1',
                    slug: 'poll-1--1234',
                    pollName: 'Poll 1',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    choices: ['Apples'],
                    voters: ['Alice'],
                    isOpen: false,
                    publicKeyShareCount: 1,
                    commonPublicKey: '33',
                    encryptedVoteCount: 1,
                    encryptedTallies: [{ c1: '1', c2: '2' }],
                    decryptionShareCount: 1,
                    publishedDecryptionShares: [['share-1']],
                    resultTallies: ['49'],
                    resultScores: [7],
                },
            },
        });

        expect(sanitizedState['poll-1']).toEqual({
            ...initialVoteState,
            pollSnapshot: {
                id: 'poll-1',
                slug: 'poll-1--1234',
                pollName: 'Poll 1',
                createdAt: '2026-01-01T00:00:00.000Z',
                choices: ['Apples'],
                voters: ['Alice'],
                isOpen: false,
                publicKeyShareCount: 1,
                commonPublicKey: '33',
                encryptedVoteCount: 1,
                encryptedTallies: [{ c1: '1', c2: '2' }],
                decryptionShareCount: 1,
                publishedDecryptionShares: [['share-1']],
                resultTallies: ['49'],
                resultScores: [7],
            },
            voterName: 'Alice',
            voterIndex: 1,
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
        });
    });

    it('promotes a recovered voter session into a resumable workflow when voting intent already exists', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    pendingVoterName: 'Alice',
                    pendingVoterToken: 'pending-token',
                    pollSlug: 'poll-1--1234',
                    selectedScores: {
                        Apples: 7,
                    },
                },
            },
            applyRecoveredSession({
                pollId: 'poll-1',
                recovery: {
                    role: 'voter',
                    pollId: 'poll-1',
                    pollSlug: 'poll-1--1234',
                    phase: 'voting',
                    isOpen: false,
                    voterName: 'Alice',
                    voterIndex: 1,
                    hasSubmittedPublicKeyShare: true,
                    hasSubmittedVote: false,
                    hasSubmittedDecryptionShares: false,
                    resultsAvailable: false,
                },
            }),
        );

        expect(nextState['poll-1']).toMatchObject({
            hasSubmittedDecryptionShares: false,
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: false,
            pendingVoterName: 'Alice',
            pendingVoterToken: null,
            shouldResumeWorkflow: true,
            voterIndex: 1,
            voterName: 'Alice',
            voterToken: 'pending-token',
        });
    });

    it('stops a resumed workflow when creator recovery is applied', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    creatorToken: 'creator-token',
                    shouldResumeWorkflow: true,
                },
            },
            applyRecoveredSession({
                pollId: 'poll-1',
                recovery: {
                    role: 'creator',
                    pollId: 'poll-1',
                    pollSlug: 'poll-1--1234',
                    phase: 'key-generation',
                    isOpen: false,
                    voterName: null,
                    voterIndex: null,
                    hasSubmittedPublicKeyShare: false,
                    hasSubmittedVote: false,
                    hasSubmittedDecryptionShares: false,
                    resultsAvailable: false,
                },
            }),
        );

        expect(nextState['poll-1']).toMatchObject({
            creatorToken: 'creator-token',
            pollSlug: 'poll-1--1234',
            shouldResumeWorkflow: false,
            workflowError: null,
        });
    });

    it('clears completed secrets when a final poll snapshot is stored', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    creatorToken: 'creator-token',
                    pendingVoterName: 'Alice',
                    pendingVoterToken: 'pending-token',
                    selectedScores: {
                        Apples: 7,
                    },
                    voterName: 'Alice',
                    voterIndex: 1,
                    voterToken: 'voter-token',
                    privateKey: '11',
                    publicKey: '22',
                    progressMessage: 'Waiting for results...',
                    workflowError: 'temporary',
                    shouldResumeWorkflow: true,
                    isVotingInProgress: true,
                },
            },
            upsertPollSnapshot({
                pollId: 'poll-1',
                poll: {
                    ...basePoll,
                    publishedDecryptionShares: [['share-1']],
                    resultTallies: ['49'],
                    resultScores: [7],
                },
            }),
        );

        expect(nextState['poll-1']).toMatchObject({
            creatorToken: null,
            pendingVoterName: null,
            pendingVoterToken: null,
            pollSlug: 'poll-1--1234',
            pollSnapshot: {
                ...basePoll,
                publishedDecryptionShares: [['share-1']],
                resultTallies: ['49'],
                resultScores: [7],
            },
            privateKey: null,
            progressMessage: null,
            publicKey: null,
            selectedScores: null,
            shouldResumeWorkflow: false,
            voterToken: null,
            workflowError: null,
        });
    });

    it('records resumable rejections without surfacing them as fatal workflow errors', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    isVotingInProgress: true,
                },
            },
            {
                type: `${voteThunkTypePrefix}/rejected`,
                meta: {
                    arg: {
                        pollId: 'poll-1',
                    },
                },
                payload: {
                    message: 'Waiting for the connection to recover...',
                    shouldResumeWorkflow: true,
                },
            },
        );

        expect(nextState['poll-1']).toMatchObject({
            isVotingInProgress: false,
            progressMessage: 'Waiting for the connection to recover...',
            shouldResumeWorkflow: true,
            workflowError: null,
        });
    });

    it('falls back to an unknown error when a rejection has no payload', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    isVotingInProgress: true,
                    progressMessage: 'Encrypting votes...',
                },
            },
            {
                type: `${voteThunkTypePrefix}/rejected`,
                meta: {
                    arg: {
                        pollId: 'poll-1',
                    },
                },
            },
        );

        expect(nextState['poll-1']).toMatchObject({
            isVotingInProgress: false,
            progressMessage: null,
            shouldResumeWorkflow: false,
            workflowError: 'Unknown voting error.',
        });
    });

    it('keeps the active voter token when a pending recovery is stored after registration already completed', () => {
        const nextState = reduce(
            {
                'poll-1': {
                    ...initialVoteState,
                    voterToken: 'existing-token',
                },
            },
            setPendingVoterRegistration({
                pollId: 'poll-1',
                voterName: 'Alice',
                pendingVoterToken: 'new-token',
            }),
        );

        expect(nextState['poll-1']).toMatchObject({
            pendingVoterName: 'Alice',
            pendingVoterToken: null,
            voterToken: 'existing-token',
            workflowError: null,
        });
    });
});
