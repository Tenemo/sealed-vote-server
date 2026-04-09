import type { PollResponse } from '@sealed-vote/contracts';

import { fetchFreshPoll } from './pollQuery';
import {
    setKeys,
    setProgressMessage,
    setSubmissionStatus,
    upsertPollSnapshot,
} from './votingSlice';
import {
    getResumableVoterName,
    hasPendingRegistrationRecovery,
    hasPendingVotingIntent,
    shouldRecoverViaSessionRequest,
    type VoteState,
} from './votingState';
import {
    runDecryptResults,
    runEncryptVotesGenerateShares,
    runProcessPublicPrivateKeys,
} from './votingWorkflow';

import { type AppDispatch, type RootState } from 'app/store';

type ResumableVotingIntent = {
    selectedScores: Record<string, number>;
    voterName: string;
};

type VotingWorkflowContext = {
    dispatch: AppDispatch;
    getState: () => RootState;
    pollId: string;
    signal?: AbortSignal;
};

export const votingWorkflowActions = {
    setKeys,
    setProgressMessage,
    setSubmissionStatus,
    upsertPollSnapshot,
};

export const runVotingSessionWorkflow = async ({
    dispatch,
    getState,
    pollId,
    signal,
}: VotingWorkflowContext): Promise<void> => {
    await runProcessPublicPrivateKeys({
        actions: votingWorkflowActions,
        dispatch,
        getState,
        pollId,
        signal,
    });
    await runEncryptVotesGenerateShares({
        actions: votingWorkflowActions,
        dispatch,
        getState,
        pollId,
        signal,
    });
    await runDecryptResults({
        actions: votingWorkflowActions,
        dispatch,
        getState,
        pollId,
        signal,
    });
};

export const refreshPollSnapshot = async ({
    dispatch,
    getState,
    pollId,
}: {
    dispatch: AppDispatch;
    getState: () => RootState;
    pollId: string;
}): Promise<PollResponse> => {
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

    return poll;
};

export const getResumableVotingIntent = (
    voteState: VoteState,
): ResumableVotingIntent | null => {
    if (!hasPendingVotingIntent(voteState)) {
        return null;
    }

    const voterName = getResumableVoterName(voteState);

    if (!voterName || !voteState.selectedScores) {
        return null;
    }

    return {
        selectedScores: voteState.selectedScores,
        voterName,
    };
};

export const getRecoveryStrategy = (
    voteState: VoteState,
): 'register' | 'session' | null => {
    if (hasPendingRegistrationRecovery(voteState)) {
        return 'register';
    }

    if (shouldRecoverViaSessionRequest(voteState)) {
        return 'session';
    }

    return null;
};
