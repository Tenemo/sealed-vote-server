import { createAsyncThunk } from '@reduxjs/toolkit';
import { canRegister } from '@sealed-vote/protocol';

import { fetchFreshPoll } from '../pollQuery';
import { pollsApi } from '../pollsApi';
import {
    clearWorkflowError,
    setKeys,
    setProgressMessage,
    setResults,
    setSelectedScores,
    setSubmissionStatus,
    setVoterSession,
} from '../votingSlice';
import { selectVoteStateByPollId } from '../votingState';
import {
    runDecryptResults,
    runEncryptVotesGenerateShares,
    runProcessPublicPrivateKeys,
} from '../votingWorkflow';

import { voteThunkTypePrefix } from './voteTypes';

import { type AppDispatch, type RootState } from 'app/store';

export type VoteThunkArg = {
    pollId: string;
    voterName: string;
    selectedScores: Record<string, number>;
};

const workflowActions = {
    setKeys,
    setProgressMessage,
    setResults,
    setSubmissionStatus,
};

export const vote = createAsyncThunk<
    void,
    VoteThunkArg,
    {
        dispatch: AppDispatch;
        state: RootState;
        rejectValue: string;
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

            dispatch(clearWorkflowError({ pollId }));
            dispatch(
                setSelectedScores({
                    pollId,
                    selectedScores,
                }),
            );

            const {
                voterName: stateVoterName,
                voterIndex: stateVoterIndex,
                voterToken: stateVoterToken,
            } = selectVoteStateByPollId(getState().voting, pollId);

            if (
                stateVoterIndex === null ||
                !stateVoterToken ||
                !stateVoterName
            ) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Registering to vote...',
                    }),
                );

                const poll = await fetchFreshPoll(dispatch, pollId);

                if (!canRegister(poll)) {
                    throw new Error('Poll is closed for new registrations.');
                }

                const registerData = await dispatch(
                    pollsApi.endpoints.registerVoter.initiate({
                        pollId,
                        voterData: {
                            voterName: normalizedVoterName,
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

            await runProcessPublicPrivateKeys({
                pollId,
                dispatch,
                getState,
                signal,
                actions: workflowActions,
            });

            await runEncryptVotesGenerateShares({
                pollId,
                dispatch,
                getState,
                signal,
                actions: workflowActions,
            });

            await runDecryptResults({
                pollId,
                dispatch,
                getState,
                signal,
                actions: workflowActions,
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Unknown voting error.';

            return rejectWithValue(message);
        }
    },
);
