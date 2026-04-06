import { Typography, Alert, CircularProgress } from '@mui/material';
import React, { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { useAppDispatch, useAppSelector } from 'app/hooks';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import {
    hasResumableVotingSession,
    selectVoteStateByPollId,
} from 'features/Polls/votingState';
import { vote } from 'features/Polls/votingThunks/vote';
import { renderError } from 'utils/utils';

const PollPage = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const { pollId } = useParams();
    if (!pollId) {
        throw new Error('Poll ID missing.');
    }
    const hasResumedVotingRef = useRef(false);
    const votingState = useAppSelector((state) =>
        selectVoteStateByPollId(state.voting, pollId),
    );
    const shouldResumeOnMountRef = useRef(
        hasResumableVotingSession(votingState),
    );
    const { results } = votingState;
    const {
        data: poll,
        isLoading: isLoadingPoll,
        error: pollError,
    } = useGetPollQuery(pollId, {
        pollingInterval: results ? 0 : 3000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        skipPollingIfUnfocused: true,
    });
    const onVote = (
        newVoterName: string,
        newSelectedScores: Record<string, number>,
    ): void => {
        void dispatch(
            vote({
                pollId,
                voterName: newVoterName,
                selectedScores: newSelectedScores,
            }),
        );
    };

    useEffect(() => {
        if (
            !hasResumedVotingRef.current &&
            shouldResumeOnMountRef.current &&
            hasResumableVotingSession(votingState)
        ) {
            hasResumedVotingRef.current = true;
            void dispatch(
                vote({
                    pollId,
                    voterName: votingState.voterName!,
                    selectedScores: votingState.selectedScores!,
                }),
            );
        }
    }, [dispatch, pollId, votingState]);

    return (
        <>
            <Helmet>
                <title>
                    {poll
                        ? poll.pollName
                        : `Vote ${pollId?.split('-')?.[0] ?? ''}`}
                </title>
            </Helmet>
            {isLoadingPoll && <CircularProgress sx={{ mt: 5 }} />}
            {pollError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {renderError(pollError)}
                </Alert>
            )}
            {poll && (
                <>
                    <PollHeader poll={poll} pollId={pollId} />
                    <Voting onVote={onVote} poll={poll} pollId={pollId} />
                    <VoteResults poll={poll} pollId={pollId} />
                    <Typography p={2} variant="body1">
                        {poll.voters.length
                            ? `Voters in this poll: ${poll.voters.join(', ')}`
                            : 'No voters yet.'}
                    </Typography>
                </>
            )}
        </>
    );
};

export default PollPage;
