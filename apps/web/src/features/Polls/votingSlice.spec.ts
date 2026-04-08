import {
    initialVoteState,
    restoreVotingStateFromPersistence,
    sanitizeVotingStateForPersistence,
    votingStatePersistenceTtlMs,
} from './votingSlice';

describe('sanitizeVotingStateForPersistence', () => {
    it('clears transient flags for active voting sessions', () => {
        const sanitizedState = sanitizeVotingStateForPersistence({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
                lastUpdatedAt: 1_000,
                pendingVoterName: 'Alice',
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
                commonPublicKey: '33',
                hasSubmittedPublicKeyShare: true,
                hasSubmittedVote: true,
                hasSubmittedDecryptionShares: false,
            },
        });

        expect(sanitizedState['poll-1']).toEqual({
            ...initialVoteState,
            creatorToken: 'creator-token',
            lastUpdatedAt: 1_000,
            pendingVoterName: 'Alice',
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
            commonPublicKey: '33',
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
                lastUpdatedAt: 2_000,
                pendingVoterName: 'Alice',
                selectedScores: {
                    Apples: 7,
                },
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
                isVotingInProgress: true,
                progressMessage: 'Waiting for common public key...',
                results: [49],
                shouldResumeWorkflow: true,
                privateKey: '11',
                publicKey: '22',
                commonPublicKey: '33',
                hasSubmittedPublicKeyShare: true,
                hasSubmittedVote: true,
                hasSubmittedDecryptionShares: false,
            },
        });

        expect(sanitizedState['poll-1']).toEqual({
            ...initialVoteState,
            lastUpdatedAt: 2_000,
            voterName: 'Alice',
            voterIndex: 1,
            isVotingInProgress: false,
            progressMessage: null,
            results: [49],
            commonPublicKey: '33',
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
        });
    });

    it('drops stale persisted voting sessions once they exceed the local-storage ttl', () => {
        const restoredState = restoreVotingStateFromPersistence(
            {
                'poll-1': {
                    ...initialVoteState,
                    lastUpdatedAt: 1_000,
                    creatorToken: 'creator-token',
                    voterToken: 'voter-token',
                    privateKey: '11',
                    publicKey: '22',
                    selectedScores: {
                        Apples: 7,
                    },
                },
            },
            1_000 + votingStatePersistenceTtlMs + 1,
        );

        expect(restoredState).toEqual({});
    });

    it('drops persisted voting sessions from older storage formats without timestamps', () => {
        const restoredState = restoreVotingStateFromPersistence(
            {
                'poll-1': {
                    ...initialVoteState,
                    creatorToken: 'creator-token',
                    voterToken: 'voter-token',
                    privateKey: '11',
                    publicKey: '22',
                    selectedScores: {
                        Apples: 7,
                    },
                },
            },
            10_000,
        );

        expect(restoredState).toEqual({});
    });

    it('keeps recent persisted voting sessions available for recovery', () => {
        const restoredState = restoreVotingStateFromPersistence(
            {
                'poll-1': {
                    ...initialVoteState,
                    creatorToken: 'creator-token',
                    lastUpdatedAt: 5_000,
                    progressMessage: 'Waiting for common public key...',
                    shouldResumeWorkflow: true,
                    selectedScores: {
                        Apples: 7,
                    },
                    voterName: 'Alice',
                    voterIndex: 1,
                    voterToken: 'voter-token',
                    workflowError: 'Temporary failure',
                },
            },
            5_000 + votingStatePersistenceTtlMs - 1,
        );

        expect(restoredState['poll-1']).toEqual({
            ...initialVoteState,
            creatorToken: 'creator-token',
            lastUpdatedAt: 5_000,
            selectedScores: {
                Apples: 7,
            },
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            shouldResumeWorkflow: true,
        });
    });
});
