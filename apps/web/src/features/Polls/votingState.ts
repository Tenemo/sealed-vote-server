import type { PollResponse } from '@sealed-vote/contracts';

import {
    hasPublishedResults,
    normalizePollResponse,
} from 'features/Polls/pollData';

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

export const hasPendingVotingIntent = (voteState: VoteState): boolean =>
    Boolean(
        voteState.selectedScores &&
        getResumableVoterName(voteState) &&
        (voteState.voterToken || voteState.pendingVoterToken) &&
        !hasPublishedResults(voteState.pollSnapshot),
    );

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
                pollSnapshot: normalizePollResponse(voteState.pollSnapshot),
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
