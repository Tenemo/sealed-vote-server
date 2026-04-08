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
});
