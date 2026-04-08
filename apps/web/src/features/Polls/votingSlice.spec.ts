import {
    initialVoteState,
    sanitizeVotingStateForPersistence,
} from './votingSlice';

describe('sanitizeVotingStateForPersistence', () => {
    it('clears transient flags for active voting sessions', () => {
        const sanitizedState = sanitizeVotingStateForPersistence({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
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
});
