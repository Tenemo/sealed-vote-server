import { createAsyncThunk } from '@reduxjs/toolkit';

import { pollsApi } from '../pollsApi';
import {
    getResumableVotingIntent,
    refreshPollSnapshot,
} from '../votingSession';
import { applyRecoveredSession } from '../votingSlice';
import {
    getRecoveryRequestData,
    selectVoteStateByPollId,
} from '../votingState';

import { vote } from './vote';

import { type AppDispatch, type RootState } from 'app/store';

type RecoverSessionThunkArg = {
    pollId: string;
};

const recoverSessionTypePrefix = 'voting/recoverSession';

export const recoverSession = createAsyncThunk<
    void,
    RecoverSessionThunkArg,
    {
        dispatch: AppDispatch;
        state: RootState;
    }
>(recoverSessionTypePrefix, async ({ pollId }, { dispatch, getState }) => {
    const voteState = selectVoteStateByPollId(getState().voting, pollId);
    const recoveryData = getRecoveryRequestData(voteState);

    if (!recoveryData) {
        return;
    }

    const recovery = await dispatch(
        pollsApi.endpoints.recoverSession.initiate({
            pollId,
            recoveryData,
        }),
    ).unwrap();

    dispatch(
        applyRecoveredSession({
            pollId,
            recovery,
        }),
    );

    try {
        await refreshPollSnapshot({
            dispatch,
            getState,
            pollId,
        });
    } catch {
        // Keep the last persisted snapshot when the live poll refetch fails.
    }

    const recoveredVoteState = selectVoteStateByPollId(
        getState().voting,
        pollId,
    );
    const resumableVotingIntent = getResumableVotingIntent(recoveredVoteState);

    if (
        recoveredVoteState.isVotingInProgress ||
        !recoveredVoteState.shouldResumeWorkflow ||
        !resumableVotingIntent
    ) {
        return;
    }

    void dispatch(
        vote({
            pollId,
            voterName: resumableVotingIntent.voterName,
            selectedScores: resumableVotingIntent.selectedScores,
        }),
    );
});
