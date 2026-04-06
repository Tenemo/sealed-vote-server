import {
    createSlice,
    type PayloadAction,
    type UnknownAction,
} from '@reduxjs/toolkit';

import { pollsApi } from './pollsApi';
import {
    clearCompletedSensitiveFields,
    initialVoteState,
    sanitizeVotingStateForPersistence,
    selectVoteStateByPollId,
    type VoteState,
    type VotingState,
} from './votingState';
import { voteThunkTypePrefix } from './votingThunks/voteTypes';

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
    voteState.workflowError = null;
    voteState.hasSubmittedPublicKeyShare = false;
    voteState.hasSubmittedVote = false;
    voteState.hasSubmittedDecryptionShares = false;
};

type VoteThunkMeta = {
    arg: {
        pollId: string;
    };
};

const hasVoteThunkPollId = (
    action: UnknownAction,
): action is PayloadAction<unknown, string, VoteThunkMeta> => {
    if (typeof action.type !== 'string') {
        return false;
    }

    const meta = (action as { meta?: unknown }).meta;
    if (!meta || typeof meta !== 'object') {
        return false;
    }

    const arg = (meta as { arg?: unknown }).arg;
    return (
        !!arg &&
        typeof arg === 'object' &&
        typeof (arg as { pollId?: unknown }).pollId === 'string'
    );
};

const isVoteThunkAction = (
    action: UnknownAction,
    suffix: 'pending' | 'fulfilled' | 'rejected',
): action is PayloadAction<unknown, string, VoteThunkMeta> =>
    action.type === `${voteThunkTypePrefix}/${suffix}` &&
    hasVoteThunkPollId(action);

export const votingSlice = createSlice({
    name: 'voting',
    initialState,
    selectors: {
        selectVotingStateByPollId: (state, pollId: string): VoteState =>
            selectVoteStateByPollId(state, pollId),
    },
    reducers: {
        clearWorkflowError: (
            state,
            action: PayloadAction<{
                pollId: string;
            }>,
        ) => {
            ensureVoteState(state, action.payload.pollId).workflowError = null;
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
                (
                    action,
                ): action is PayloadAction<unknown, string, VoteThunkMeta> =>
                    isVoteThunkAction(action, 'pending'),
                (state, action) => {
                    const voteState = ensureVoteState(
                        state,
                        action.meta.arg.pollId,
                    );
                    voteState.isVotingInProgress = true;
                    voteState.workflowError = null;
                },
            )
            .addMatcher(
                (
                    action,
                ): action is PayloadAction<unknown, string, VoteThunkMeta> =>
                    isVoteThunkAction(action, 'fulfilled'),
                (state, action) => {
                    const voteState = ensureVoteState(
                        state,
                        action.meta.arg.pollId,
                    );

                    voteState.isVotingInProgress = false;
                    voteState.progressMessage = null;
                },
            )
            .addMatcher(
                (
                    action,
                ): action is PayloadAction<
                    string | undefined,
                    string,
                    VoteThunkMeta
                > => isVoteThunkAction(action, 'rejected'),
                (state, action) => {
                    const voteState = ensureVoteState(
                        state,
                        action.meta.arg.pollId,
                    );

                    voteState.isVotingInProgress = false;
                    voteState.progressMessage = null;
                    voteState.workflowError =
                        typeof action.payload === 'string'
                            ? action.payload
                            : 'Unknown voting error.';
                },
            );
    },
});

export const {
    clearWorkflowError,
    setKeys,
    setProgressMessage,
    setResults,
    setSelectedScores,
    setSubmissionStatus,
    setVoterSession,
} = votingSlice.actions;

export const { selectVotingStateByPollId } = votingSlice.selectors;

export { initialVoteState, sanitizeVotingStateForPersistence };
