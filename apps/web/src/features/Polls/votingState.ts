export type VoteState = {
    creatorToken: string | null;
    pendingVoterName: string | null;
    selectedScores: Record<string, number> | null;
    voterName: string | null;
    voterIndex: number | null;
    voterToken: string | null;
    isVotingInProgress: boolean;
    progressMessage: string | null;
    workflowError: string | null;
    shouldResumeWorkflow: boolean;
    results: number[] | null;
    privateKey: string | null;
    publicKey: string | null;
    commonPublicKey: string | null;
    hasSubmittedPublicKeyShare: boolean;
    hasSubmittedVote: boolean;
    hasSubmittedDecryptionShares: boolean;
};

export type VotingState = Record<string, VoteState>;

export const initialVoteState: VoteState = {
    creatorToken: null,
    pendingVoterName: null,
    selectedScores: null,
    isVotingInProgress: false,
    voterName: null,
    voterIndex: null,
    voterToken: null,
    progressMessage: null,
    workflowError: null,
    shouldResumeWorkflow: false,
    results: null,
    privateKey: null,
    publicKey: null,
    commonPublicKey: null,
    hasSubmittedPublicKeyShare: false,
    hasSubmittedVote: false,
    hasSubmittedDecryptionShares: false,
};

export const selectVoteStateByPollId = (
    state: VotingState,
    pollId: string,
): VoteState => state[pollId] ?? initialVoteState;

export const getResumableVoterName = (voteState: VoteState): string | null =>
    voteState.voterName ?? voteState.pendingVoterName;

export const hasResumableVotingSession = (voteState: VoteState): boolean =>
    Boolean(
        voteState.selectedScores &&
        voteState.voterIndex !== null &&
        voteState.voterName &&
        voteState.voterToken &&
        !voteState.results,
    );

export const hasPendingVotingIntent = (voteState: VoteState): boolean =>
    Boolean(
        voteState.selectedScores &&
        getResumableVoterName(voteState) &&
        !voteState.results,
    );

export const clearCompletedSensitiveFields = (
    voteState: VoteState,
): VoteState => ({
    ...voteState,
    creatorToken: null,
    pendingVoterName: null,
    selectedScores: null,
    voterToken: null,
    privateKey: null,
    publicKey: null,
    progressMessage: null,
    workflowError: null,
    shouldResumeWorkflow: false,
    isVotingInProgress: false,
});

export const sanitizeVotingStateForPersistence = (
    state: VotingState,
): VotingState =>
    Object.fromEntries(
        Object.entries(state).map(([pollId, voteState]) => [
            pollId,
            voteState.results
                ? {
                      ...initialVoteState,
                      ...clearCompletedSensitiveFields(voteState),
                  }
                : {
                      ...initialVoteState,
                      ...voteState,
                      isVotingInProgress: false,
                      progressMessage: null,
                      workflowError: null,
                  },
        ]),
    );
