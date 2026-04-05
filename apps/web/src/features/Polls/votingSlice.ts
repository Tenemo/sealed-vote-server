import type { PayloadAction } from '@reduxjs/toolkit';
import { canRegister } from '@sealed-vote/protocol';

import { createAppSlice } from 'app/createAppSlice';
import { fetchFreshPoll } from 'features/Polls/pollQuery';
import { pollsApi } from 'features/Polls/pollsApi';
import {
    initialVoteState,
    sanitizeVotingStateForPersistence,
    selectVoteStateByPollId,
    type VoteState,
    type VotingState,
} from 'features/Polls/votingState';
import {
    runDecryptResults,
    runEncryptVotesGenerateShares,
    runProcessPublicPrivateKeys,
} from 'features/Polls/votingWorkflow';

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

type VotingActionCreators = {
    setKeys: (payload: {
        pollId: string;
        privateKey: string;
        publicKey: string;
        commonPublicKey: string | null;
    }) => PayloadAction<unknown>;
    setProgressMessage: (payload: {
        progressMessage: string | null;
        pollId: string;
    }) => PayloadAction<unknown>;
    setResults: (payload: {
        results: number[];
        pollId: string;
    }) => PayloadAction<unknown>;
    setSelectedScores: (payload: {
        pollId: string;
        selectedScores: Record<string, number>;
    }) => PayloadAction<unknown>;
    setSubmissionStatus: (payload: {
        pollId: string;
        phase: 'publicKey' | 'vote' | 'decryptionShares';
        submitted: boolean;
    }) => PayloadAction<unknown>;
    setVoterSession: (payload: {
        pollId: string;
        voterName: string;
        voterIndex: number;
        voterToken: string;
    }) => PayloadAction<unknown>;
};

let votingActionCreators: VotingActionCreators | null = null;

const getVotingActions = (): VotingActionCreators => {
    if (!votingActionCreators) {
        throw new Error('Voting actions are not initialized.');
    }

    return votingActionCreators;
};

export const votingSlice = createAppSlice({
    name: 'voting',
    initialState,
    selectors: {
        selectVotingStateByPollId: (state, pollId: string): VoteState =>
            selectVoteStateByPollId(state, pollId),
    },
    reducers: (create) => {
        const createVotingAsyncThunk = create.asyncThunk.withTypes<{
            rejectValue: string;
        }>();

        return {
            setSelectedScores: create.reducer(
                (
                    state,
                    action: PayloadAction<{
                        pollId: string;
                        selectedScores: Record<string, number>;
                    }>,
                ) => {
                    const { pollId, selectedScores } = action.payload;
                    ensureVoteState(state, pollId).selectedScores =
                        selectedScores;
                },
            ),
            setIsVotingInProgress: create.reducer(
                (
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
            ),
            setVoterSession: create.reducer(
                (
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
            ),
            setKeys: create.reducer(
                (
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
            ),
            setProgressMessage: create.reducer(
                (
                    state,
                    action: PayloadAction<{
                        progressMessage: string | null;
                        pollId: string;
                    }>,
                ) => {
                    const { pollId, progressMessage } = action.payload;
                    ensureVoteState(state, pollId).progressMessage =
                        progressMessage;
                },
            ),
            setResults: create.reducer(
                (
                    state,
                    action: PayloadAction<{
                        results: number[];
                        pollId: string;
                    }>,
                ) => {
                    const { pollId, results } = action.payload;
                    const voteState = ensureVoteState(state, pollId);
                    voteState.results = results;
                    Object.assign(
                        voteState,
                        clearCompletedSensitiveFields(voteState),
                    );
                },
            ),
            setSubmissionStatus: create.reducer(
                (
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
            ),
            processPublicPrivateKeys: createVotingAsyncThunk(
                async (
                    { pollId }: { pollId: string },
                    { dispatch, getState, signal, rejectWithValue },
                ) => {
                    try {
                        await runProcessPublicPrivateKeys({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : 'Failed during public/private key processing.';

                        return rejectWithValue(message);
                    }
                },
            ),
            encryptVotesGenerateShares: createVotingAsyncThunk(
                async (
                    { pollId }: { pollId: string },
                    { dispatch, getState, signal, rejectWithValue },
                ) => {
                    try {
                        await runEncryptVotesGenerateShares({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : 'Failed during vote encryption/decryption-share flow.';

                        return rejectWithValue(message);
                    }
                },
            ),
            decryptResults: createVotingAsyncThunk(
                async (
                    { pollId }: { pollId: string },
                    { dispatch, getState, signal, rejectWithValue },
                ) => {
                    try {
                        await runDecryptResults({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : 'Failed during result decryption wait.';

                        return rejectWithValue(message);
                    }
                },
            ),
            vote: createVotingAsyncThunk(
                async (
                    {
                        pollId,
                        voterName,
                        selectedScores,
                    }: {
                        pollId: string;
                        voterName: string;
                        selectedScores: Record<string, number>;
                    },
                    { dispatch, getState, signal, rejectWithValue },
                ) => {
                    const normalizedVoterName = voterName.trim();

                    try {
                        if (!selectedScores || !normalizedVoterName) {
                            throw new Error(
                                'Missing required data to participate in the vote.',
                            );
                        }

                        dispatch(
                            getVotingActions().setSelectedScores({
                                pollId,
                                selectedScores,
                            }),
                        );

                        const {
                            voterName: stateVoterName,
                            voterIndex: stateVoterIndex,
                            voterToken: stateVoterToken,
                        } = selectVoteStateByPollId(
                            (getState() as { voting: VotingState }).voting,
                            pollId,
                        );

                        if (
                            !stateVoterIndex ||
                            !stateVoterToken ||
                            !stateVoterName
                        ) {
                            dispatch(
                                getVotingActions().setProgressMessage({
                                    pollId,
                                    progressMessage: 'Registering to vote...',
                                }),
                            );

                            const poll = await fetchFreshPoll(pollId);

                            if (!canRegister(poll)) {
                                throw new Error(
                                    'Poll is closed for new registrations.',
                                );
                            }

                            const registerResult = (await dispatch(
                                pollsApi.endpoints.registerVoter.initiate({
                                    pollId,
                                    voterData: {
                                        voterName: normalizedVoterName,
                                    },
                                }),
                            )) as unknown as {
                                unwrap: () => Promise<{
                                    pollId: string;
                                    voterName: string;
                                    voterIndex: number;
                                    voterToken: string;
                                }>;
                            };

                            const registerData = await registerResult.unwrap();

                            dispatch(
                                getVotingActions().setVoterSession({
                                    pollId,
                                    voterIndex: registerData.voterIndex,
                                    voterName: registerData.voterName,
                                    voterToken: registerData.voterToken,
                                }),
                            );
                        }

                        await runProcessPublicPrivateKeys({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });

                        await runEncryptVotesGenerateShares({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });

                        await runDecryptResults({
                            pollId,
                            dispatch,
                            getState,
                            signal,
                            actions: {
                                setKeys: getVotingActions().setKeys,
                                setProgressMessage:
                                    getVotingActions().setProgressMessage,
                                setResults: getVotingActions().setResults,
                                setSubmissionStatus:
                                    getVotingActions().setSubmissionStatus,
                            },
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : 'Unknown voting error.';

                        console.error('Error voting:', message);

                        return rejectWithValue(message);
                    }
                },
                {
                    pending: (
                        state,
                        action: PayloadAction<
                            undefined,
                            string,
                            { arg: { pollId: string } }
                        >,
                    ) => {
                        ensureVoteState(
                            state,
                            action.meta.arg.pollId,
                        ).isVotingInProgress = true;
                    },
                    settled: (
                        state,
                        action: PayloadAction<
                            unknown,
                            string,
                            { arg: { pollId: string } }
                        >,
                    ) => {
                        const voteState = ensureVoteState(
                            state,
                            action.meta.arg.pollId,
                        );

                        voteState.isVotingInProgress = false;
                        voteState.progressMessage = null;
                    },
                },
            ),
        };
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
    decryptResults,
    encryptVotesGenerateShares,
    processPublicPrivateKeys,
    setIsVotingInProgress,
    setKeys,
    setProgressMessage,
    setResults,
    setSelectedScores,
    setSubmissionStatus,
    setVoterSession,
    vote,
} = votingSlice.actions;

votingActionCreators = {
    setKeys,
    setProgressMessage,
    setResults,
    setSelectedScores,
    setSubmissionStatus,
    setVoterSession,
};

export const { selectVotingStateByPollId } = votingSlice.selectors;

export { initialVoteState, sanitizeVotingStateForPersistence };
