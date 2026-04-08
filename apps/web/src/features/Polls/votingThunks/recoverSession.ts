import { createAsyncThunk } from '@reduxjs/toolkit';

import { fetchFreshPoll } from '../pollQuery';
import { pollsApi } from '../pollsApi';
import { applyRecoveredSession, upsertPollSnapshot } from '../votingSlice';
import {
    getResumableVoterName,
    hasPendingVotingIntent,
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
    const recoveryData = voteState.voterToken
        ? { voterToken: voteState.voterToken }
        : voteState.pendingVoterToken
          ? { voterToken: voteState.pendingVoterToken }
          : voteState.creatorToken
            ? { creatorToken: voteState.creatorToken }
            : null;

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
        const poll = await fetchFreshPoll({
            dispatch,
            getState,
            pollId,
        });
        dispatch(
            upsertPollSnapshot({
                pollId: poll.id,
                poll,
            }),
        );
    } catch {
        // Keep the last persisted snapshot when the live poll refetch fails.
    }

    const recoveredVoteState = selectVoteStateByPollId(
        getState().voting,
        pollId,
    );
    const resumableVoterName = getResumableVoterName(recoveredVoteState);

    if (
        recoveredVoteState.isVotingInProgress ||
        !recoveredVoteState.shouldResumeWorkflow ||
        !hasPendingVotingIntent(recoveredVoteState) ||
        !resumableVoterName ||
        !recoveredVoteState.selectedScores
    ) {
        return;
    }

    void dispatch(
        vote({
            pollId,
            voterName: resumableVoterName,
            selectedScores: recoveredVoteState.selectedScores,
        }),
    );
});
