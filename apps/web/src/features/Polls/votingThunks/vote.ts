import { createAsyncThunk } from '@reduxjs/toolkit';
import { canRegister } from '@sealed-vote/protocol';

import { generateClientToken } from '../clientToken';
import { fetchFreshPoll } from '../pollQuery';
import { pollsApi } from '../pollsApi';
import { runVotingSessionWorkflow } from '../votingSession';
import {
    clearWorkflowError,
    setPendingVoterRegistration,
    setProgressMessage,
    setSelectedScores,
    setVoterSession,
    type VoteThunkRejectValue,
} from '../votingSlice';
import {
    hasRegisteredVoterSession,
    selectVoteStateByPollId,
} from '../votingState';

import { voteThunkTypePrefix } from './voteTypes';

import { type AppDispatch, type RootState } from 'app/store';
import {
    isConnectionError,
    isConnectionErrorMessage,
    reconnectingWorkflowMessage,
} from 'utils/networkErrors';

type VoteThunkArg = {
    pollId: string;
    voterName: string;
    selectedScores: Record<string, number>;
};

export const vote = createAsyncThunk<
    void,
    VoteThunkArg,
    {
        dispatch: AppDispatch;
        state: RootState;
        rejectValue: VoteThunkRejectValue;
    }
>(
    voteThunkTypePrefix,
    async (
        { pollId, voterName, selectedScores }: VoteThunkArg,
        { dispatch, getState, signal, rejectWithValue },
    ) => {
        const normalizedVoterName = voterName.trim();

        try {
            if (!selectedScores || !normalizedVoterName) {
                throw new Error(
                    'Missing required data to participate in the vote.',
                );
            }

            const existingVoteState = selectVoteStateByPollId(
                getState().voting,
                pollId,
            );
            const pendingVoterToken =
                existingVoteState.pendingVoterToken ??
                existingVoteState.voterToken ??
                generateClientToken();

            dispatch(clearWorkflowError({ pollId }));
            dispatch(
                setPendingVoterRegistration({
                    pollId,
                    pendingVoterToken,
                    voterName: normalizedVoterName,
                }),
            );
            dispatch(
                setSelectedScores({
                    pollId,
                    selectedScores,
                }),
            );

            const currentVoteState = selectVoteStateByPollId(
                getState().voting,
                pollId,
            );

            if (!hasRegisteredVoterSession(currentVoteState)) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Registering to vote...',
                    }),
                );

                const poll = await fetchFreshPoll({
                    dispatch,
                    getState,
                    pollId,
                });

                if (!canRegister(poll)) {
                    throw new Error('Poll is closed for new registrations.');
                }

                const registerData = await dispatch(
                    pollsApi.endpoints.registerVoter.initiate({
                        pollId,
                        voterData: {
                            voterName: normalizedVoterName,
                            voterToken: pendingVoterToken,
                        },
                    }),
                ).unwrap();

                dispatch(
                    setVoterSession({
                        pollId,
                        voterIndex: registerData.voterIndex,
                        voterName: registerData.voterName,
                        voterToken: registerData.voterToken,
                    }),
                );
            }

            await runVotingSessionWorkflow({
                pollId,
                dispatch,
                getState,
                signal,
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                      ? error
                      : 'Unknown voting error.';
            const shouldResumeWorkflow =
                isConnectionError(error) || isConnectionErrorMessage(message);

            return rejectWithValue({
                message: shouldResumeWorkflow
                    ? reconnectingWorkflowMessage
                    : message,
                shouldResumeWorkflow,
            });
        }
    },
);
