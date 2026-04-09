import type { PollResponse } from '@sealed-vote/contracts';

import { hasPublishedResults } from 'features/Polls/pollResults';

export type VoteState = {
    creatorToken: string | null;
    pendingVoterName: string | null;
    pendingVoterToken: string | null;
    pollSlug: string | null;
    pollSnapshot: PollResponse | null;
    selectedScores: Record<string, number> | null;
    voterName: string | null;
    voterIndex: number | null;
    voterToken: string | null;
    isVotingInProgress: boolean;
    progressMessage: string | null;
    workflowError: string | null;
    shouldResumeWorkflow: boolean;
    privateKey: string | null;
    publicKey: string | null;
    hasSubmittedPublicKeyShare: boolean;
    hasSubmittedVote: boolean;
    hasSubmittedDecryptionShares: boolean;
};

export type VotingState = Record<string, VoteState>;

type RecoveryRequestData =
    | {
          creatorToken: string;
      }
    | {
          voterToken: string;
      };

export const initialVoteState: VoteState = {
    creatorToken: null,
    pendingVoterName: null,
    pendingVoterToken: null,
    pollSlug: null,
    pollSnapshot: null,
    selectedScores: null,
    isVotingInProgress: false,
    voterName: null,
    voterIndex: null,
    voterToken: null,
    progressMessage: null,
    workflowError: null,
    shouldResumeWorkflow: false,
    privateKey: null,
    publicKey: null,
    hasSubmittedPublicKeyShare: false,
    hasSubmittedVote: false,
    hasSubmittedDecryptionShares: false,
};

export const selectVoteStateByPollId = (
    state: VotingState,
    pollId: string,
): VoteState => state[pollId] ?? initialVoteState;

export const selectVoteStateByPollSlug = (
    state: VotingState,
    pollSlug: string,
): VoteState =>
    Object.values(state).find(
        (voteState) =>
            voteState.pollSlug === pollSlug ||
            voteState.pollSnapshot?.slug === pollSlug,
    ) ?? initialVoteState;

export const getResumableVoterName = (voteState: VoteState): string | null =>
    voteState.voterName ?? voteState.pendingVoterName;

export const hasRegisteredVoterSession = (
    voteState: VoteState,
): voteState is VoteState & {
    voterIndex: number;
    voterName: string;
    voterToken: string;
} =>
    voteState.voterIndex !== null &&
    Boolean(voteState.voterName) &&
    Boolean(voteState.voterToken);

export const hasPendingRegistrationRecovery = (
    voteState: VoteState,
): voteState is VoteState & {
    pendingVoterName: string;
    pendingVoterToken: string;
    selectedScores: Record<string, number>;
} =>
    Boolean(
        voteState.pendingVoterName &&
        voteState.pendingVoterToken &&
        voteState.selectedScores,
    );

export const hasPendingVotingIntent = (voteState: VoteState): boolean =>
    Boolean(
        voteState.selectedScores &&
        getResumableVoterName(voteState) &&
        (voteState.voterToken || voteState.pendingVoterToken) &&
        !hasPublishedResults(voteState.pollSnapshot),
    );

export const getRecoveryRequestData = (
    voteState: VoteState,
): RecoveryRequestData | null => {
    if (voteState.voterToken) {
        return {
            voterToken: voteState.voterToken,
        };
    }

    if (voteState.pendingVoterToken) {
        return {
            voterToken: voteState.pendingVoterToken,
        };
    }

    if (voteState.creatorToken) {
        return {
            creatorToken: voteState.creatorToken,
        };
    }

    return null;
};

export const shouldRecoverViaSessionRequest = (voteState: VoteState): boolean =>
    Boolean(voteState.creatorToken || hasPendingVotingIntent(voteState));

export const shouldAttemptRecovery = (voteState: VoteState): boolean => {
    if (
        hasPublishedResults(voteState.pollSnapshot) ||
        voteState.isVotingInProgress
    ) {
        return false;
    }

    return (
        hasPendingRegistrationRecovery(voteState) ||
        shouldRecoverViaSessionRequest(voteState)
    );
};

export const clearCompletedSensitiveFields = (
    voteState: VoteState,
): VoteState => ({
    ...voteState,
    creatorToken: null,
    pendingVoterName: null,
    pendingVoterToken: null,
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
): VotingState => {
    return Object.fromEntries(
        Object.entries(state).map(([pollId, voteState]) => {
            const normalizedVoteState: VoteState = {
                ...initialVoteState,
                ...voteState,
                pollSnapshot: voteState.pollSnapshot ?? null,
            };

            return [
                pollId,
                hasPublishedResults(normalizedVoteState.pollSnapshot)
                    ? {
                          ...initialVoteState,
                          ...clearCompletedSensitiveFields(normalizedVoteState),
                      }
                    : {
                          ...normalizedVoteState,
                          isVotingInProgress: false,
                          progressMessage: null,
                          workflowError: null,
                      },
            ];
        }),
    );
};
