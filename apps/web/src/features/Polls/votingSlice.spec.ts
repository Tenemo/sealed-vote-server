import {
    initialVoteState,
    sanitizeVotingStateForPersistence,
} from './votingSlice';

describe('sanitizeVotingStateForPersistence', () => {
    it('keeps session data but clears transient progress flags', () => {
        const sanitizedState = sanitizeVotingStateForPersistence({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
                selectedScores: {
                    Apples: 7,
                },
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
                isVotingInProgress: true,
                progressMessage: 'Waiting for common public key...',
                results: [49],
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
            selectedScores: {
                Apples: 7,
            },
            voterName: 'Alice',
            voterIndex: 1,
            voterToken: 'voter-token',
            isVotingInProgress: false,
            progressMessage: null,
            results: [49],
            privateKey: '11',
            publicKey: '22',
            commonPublicKey: '33',
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
        });
    });
});
