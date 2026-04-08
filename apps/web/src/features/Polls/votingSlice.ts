import {
    createSlice,
    type PayloadAction,
    type UnknownAction,
} from '@reduxjs/toolkit';
import type {
    PollResponse,
    RecoverSessionResponse,
} from '@sealed-vote/contracts';

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
    voteState.pendingVoterName = payload.voterName;
    voteState.voterName = payload.voterName;
    voteState.voterIndex = payload.voterIndex;
    voteState.voterToken = payload.voterToken;
    voteState.workflowError = null;
    voteState.shouldResumeWorkflow = false;
    voteState.hasSubmittedPublicKeyShare = false;
    voteState.hasSubmittedVote = false;
    voteState.hasSubmittedDecryptionShares = false;
};

const applyPollSnapshot = (voteState: VoteState, poll: PollResponse): void => {
    voteState.pollSlug = poll.slug;
    voteState.pollSnapshot = poll;
    voteState.commonPublicKey = poll.commonPublicKey;

    if (!poll.results.length) {
        return;
    }

    voteState.results = poll.results;
    Object.assign(voteState, clearCompletedSensitiveFields(voteState));
    voteState.pollSlug = poll.slug;
    voteState.pollSnapshot = poll;
    voteState.commonPublicKey = poll.commonPublicKey;
    voteState.results = poll.results;
};

export type VoteThunkRejectValue = {
    message: string;
    shouldResumeWorkflow: boolean;
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
        applyRecoveredSession: (
            state,
            action: PayloadAction<{
                pollId: string;
                recovery: RecoverSessionResponse;
            }>,
        ) => {
            const { pollId, recovery } = action.payload;
            const voteState = ensureVoteState(state, pollId);

            voteState.pollSlug = recovery.pollSlug;
            voteState.workflowError = null;

            if (recovery.role === 'voter') {
                voteState.pendingVoterName =
                    recovery.voterName ?? voteState.pendingVoterName;
                voteState.voterName = recovery.voterName ?? voteState.voterName;
                voteState.voterIndex =
                    recovery.voterIndex ?? voteState.voterIndex;
                voteState.hasSubmittedPublicKeyShare =
                    recovery.hasSubmittedPublicKeyShare;
                voteState.hasSubmittedVote = recovery.hasSubmittedVote;
                voteState.hasSubmittedDecryptionShares =
                    recovery.hasSubmittedDecryptionShares;
                voteState.shouldResumeWorkflow = Boolean(
                    voteState.selectedScores &&
                    voteState.voterToken &&
                    !recovery.resultsAvailable,
                );
                return;
            }

            voteState.shouldResumeWorkflow = false;
        },
        clearWorkflowError: (
            state,
            action: PayloadAction<{
                pollId: string;
            }>,
        ) => {
            ensureVoteState(state, action.payload.pollId).workflowError = null;
        },
        forgetLocalVoteState: (
            state,
            action: PayloadAction<{
                pollId: string;
            }>,
        ) => {
            delete state[action.payload.pollId];
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
        setPendingVoterRegistration: (
            state,
            action: PayloadAction<{
                pollId: string;
                voterName: string;
                voterToken: string;
            }>,
        ) => {
            const { pollId, voterName, voterToken } = action.payload;
            const voteState = ensureVoteState(state, pollId);

            voteState.pendingVoterName = voterName;
            voteState.voterToken = voterToken;
            voteState.workflowError = null;
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

            if (voteState.pollSnapshot) {
                voteState.pollSnapshot = {
                    ...voteState.pollSnapshot,
                    results,
                };
            }

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
        setShouldResumeWorkflow: (
            state,
            action: PayloadAction<{
                pollId: string;
                shouldResumeWorkflow: boolean;
            }>,
        ) => {
            const { pollId, shouldResumeWorkflow } = action.payload;
            ensureVoteState(state, pollId).shouldResumeWorkflow =
                shouldResumeWorkflow;
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
        upsertPollSnapshot: (
            state,
            action: PayloadAction<{
                pollId: string;
                poll: PollResponse;
            }>,
        ) => {
            const { pollId, poll } = action.payload;
            applyPollSnapshot(ensureVoteState(state, pollId), poll);
        },
    },
    extraReducers: (builder) => {
        builder
            .addMatcher(
                pollsApi.endpoints.createPoll.matchFulfilled,
                (state, { payload }) => {
                    const voteState = ensureVoteState(state, payload.id);
                    voteState.creatorToken = payload.creatorToken;
                    voteState.pollSlug = payload.slug;
                },
            )
            .addMatcher(
                pollsApi.endpoints.getPoll.matchFulfilled,
                (state, { payload }) => {
                    applyPollSnapshot(
                        ensureVoteState(state, payload.id),
                        payload,
                    );
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
                    voteState.shouldResumeWorkflow = false;
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
                    voteState.shouldResumeWorkflow = false;
                },
            )
            .addMatcher(
                (
                    action,
                ): action is PayloadAction<
                    VoteThunkRejectValue | undefined,
                    string,
                    VoteThunkMeta
                > => isVoteThunkAction(action, 'rejected'),
                (state, action) => {
                    const voteState = ensureVoteState(
                        state,
                        action.meta.arg.pollId,
                    );

                    voteState.isVotingInProgress = false;
                    if (action.payload?.shouldResumeWorkflow) {
                        voteState.progressMessage = action.payload.message;
                        voteState.workflowError = null;
                        voteState.shouldResumeWorkflow = true;
                        return;
                    }

                    voteState.progressMessage = null;
                    voteState.workflowError =
                        action.payload?.message ?? 'Unknown voting error.';
                    voteState.shouldResumeWorkflow = false;
                },
            );
    },
});

export const {
    applyRecoveredSession,
    clearWorkflowError,
    forgetLocalVoteState,
    setKeys,
    setPendingVoterRegistration,
    setProgressMessage,
    setResults,
    setSelectedScores,
    setShouldResumeWorkflow,
    setSubmissionStatus,
    setVoterSession,
    upsertPollSnapshot,
} = votingSlice.actions;

export const { selectVotingStateByPollId } = votingSlice.selectors;

export { initialVoteState, sanitizeVotingStateForPersistence };
