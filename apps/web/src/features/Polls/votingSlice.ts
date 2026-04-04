import type { PayloadAction } from '@reduxjs/toolkit';

import { pollsApi } from './pollsApi';

import { createAppSlice } from 'app/createAppSlice';
import type { RootState } from 'app/store';

export type VoteState = {
    creatorToken: string | null;
    selectedScores: Record<string, number> | null;
    voterName: string | null;
    voterIndex: number | null;
    voterToken: string | null;
    isVotingInProgress: boolean;
    progressMessage: string | null;
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
    selectedScores: null,
    isVotingInProgress: false,
    voterName: null,
    voterIndex: null,
    voterToken: null,
    progressMessage: null,
    results: null,
    privateKey: null,
    publicKey: null,
    commonPublicKey: null,
    hasSubmittedPublicKeyShare: false,
    hasSubmittedVote: false,
    hasSubmittedDecryptionShares: false,
};

const initialState: VotingState = {};

const ensureVoteState = (state: VotingState, pollId: string): VoteState => {
    if (!state[pollId]) {
        state[pollId] = { ...initialVoteState };
    }

    return state[pollId];
};

const applyRegistration = (
    voteState: VoteState,
    payload: {
        voterName: string;
        voterIndex: number;
        voterToken: string;
    },
): void => {
    voteState.voterName = payload.voterName;
    voteState.voterIndex = payload.voterIndex;
    voteState.voterToken = payload.voterToken;
    voteState.hasSubmittedPublicKeyShare = false;
    voteState.hasSubmittedVote = false;
    voteState.hasSubmittedDecryptionShares = false;
};

const clearCompletedSensitiveFields = (voteState: VoteState): VoteState => ({
    ...voteState,
    creatorToken: null,
    selectedScores: null,
    voterToken: null,
    privateKey: null,
    publicKey: null,
    progressMessage: null,
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
                  },
        ]),
    );

export const selectVotingStateByPollId = (
    state: RootState,
    pollId: string,
): VoteState => state.voting[pollId] ?? initialVoteState;

export const votingSlice = createAppSlice({
    name: 'voting',
    initialState,
    reducers: {
        setSelectedScores: (
            state,
            action: PayloadAction<{
                pollId: string;
                selectedScores: Record<string, number>;
            }>,
        ) => {
            const { pollId, selectedScores } = action.payload;
            ensureVoteState(state, pollId).selectedScores = selectedScores;
        },
        setIsVotingInProgress: (
            state,
            action: PayloadAction<{
                pollId: string;
                isVotingInProgress: boolean;
            }>,
        ) => {
            const { pollId, isVotingInProgress } = action.payload;
            ensureVoteState(state, pollId).isVotingInProgress =
                isVotingInProgress;
        },
        setVoterSession: (
            state,
            action: PayloadAction<{
                pollId: string;
                voterName: string;
                voterIndex: number;
                voterToken: string;
            }>,
        ) => {
            const { pollId, voterName, voterIndex, voterToken } =
                action.payload;
            applyRegistration(ensureVoteState(state, pollId), {
                voterName,
                voterIndex,
                voterToken,
            });
        },
        setKeys: (
            state,
            action: PayloadAction<{
                pollId: string;
                privateKey: string;
                publicKey: string;
                commonPublicKey: string | null;
            }>,
        ) => {
            const { pollId, privateKey, publicKey, commonPublicKey } =
                action.payload;
            const voteState = ensureVoteState(state, pollId);
            voteState.privateKey = privateKey;
            voteState.publicKey = publicKey;
            voteState.commonPublicKey = commonPublicKey;
        },
        setProgressMessage: (
            state,
            action: PayloadAction<{
                progressMessage: string | null;
                pollId: string;
            }>,
        ) => {
            const { pollId, progressMessage } = action.payload;
            ensureVoteState(state, pollId).progressMessage = progressMessage;
        },
        setResults: (
            state,
            action: PayloadAction<{
                results: number[];
                pollId: string;
            }>,
        ) => {
            const { pollId, results } = action.payload;
            const voteState = ensureVoteState(state, pollId);
            voteState.results = results;
            Object.assign(voteState, clearCompletedSensitiveFields(voteState));
        },
        setSubmissionStatus: (
            state,
            action: PayloadAction<{
                pollId: string;
                phase: 'publicKey' | 'vote' | 'decryptionShares';
                submitted: boolean;
            }>,
        ) => {
            const { pollId, phase, submitted } = action.payload;
            const voteState = ensureVoteState(state, pollId);

            switch (phase) {
                case 'publicKey':
                    voteState.hasSubmittedPublicKeyShare = submitted;
                    return;
                case 'vote':
                    voteState.hasSubmittedVote = submitted;
                    return;
                case 'decryptionShares':
                    voteState.hasSubmittedDecryptionShares = submitted;
                    return;
                default:
                    return;
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addMatcher(
                pollsApi.endpoints.createPoll.matchFulfilled,
                (state, { payload }) => {
                    ensureVoteState(state, payload.id).creatorToken =
                        payload.creatorToken;
                },
            )
            .addMatcher(
                pollsApi.endpoints.registerVoter.matchFulfilled,
                (
                    state,
                    { payload: { pollId, voterName, voterIndex, voterToken } },
                ) => {
                    applyRegistration(ensureVoteState(state, pollId), {
                        voterName,
                        voterIndex,
                        voterToken,
                    });
                },
            );
    },
});

export const {
    setSelectedScores,
    setIsVotingInProgress,
    setProgressMessage,
    setKeys,
    setResults,
    setSubmissionStatus,
    setVoterSession,
} = votingSlice.actions;
