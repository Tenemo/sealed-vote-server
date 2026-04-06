import { Typography, Alert, Box, CircularProgress } from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { isUuid } from '@sealed-vote/contracts';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { useAppDispatch, useAppSelector } from 'app/hooks';
import NotFound from 'components/NotFound/NotFound';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import {
    hasResumableVotingSession,
    initialVoteState,
    selectVoteStateByPollId,
} from 'features/Polls/votingState';
import { vote } from 'features/Polls/votingThunks/vote';
import { renderError } from 'utils/utils';

const isNotFoundError = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404;

const PollPage = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const { pollSlug } = useParams();
    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }
    const isLegacyPollLink = isUuid(pollSlug);
    const hasResumedVotingRef = useRef(false);
    const shouldResumeOnResolvedPollRef = useRef(false);
    const resolvedPollIdRef = useRef<string | null>(null);
    const {
        data: poll,
        isLoading: isLoadingPoll,
        error: pollError,
    } = useGetPollQuery(isLegacyPollLink ? skipToken : pollSlug, {
        pollingInterval: 3000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        skipPollingIfUnfocused: true,
    });
    const pollId = poll?.id ?? null;
    const votingState = useAppSelector((state) =>
        pollId
            ? selectVoteStateByPollId(state.voting, pollId)
            : initialVoteState,
    );
    const onVote = (
        newVoterName: string,
        newSelectedScores: Record<string, number>,
    ): void => {
        if (!pollId) {
            return;
        }

        void dispatch(
            vote({
                pollId,
                voterName: newVoterName,
                selectedScores: newSelectedScores,
            }),
        );
    };

    useLayoutEffect(() => {
        if (!pollId || resolvedPollIdRef.current === pollId) {
            return;
        }

        resolvedPollIdRef.current = pollId;
        shouldResumeOnResolvedPollRef.current =
            hasResumableVotingSession(votingState);
        hasResumedVotingRef.current = false;
    }, [pollId, votingState]);

    useEffect(() => {
        if (!pollId) {
            return;
        }

        if (
            !hasResumedVotingRef.current &&
            shouldResumeOnResolvedPollRef.current &&
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

    if (isLegacyPollLink || isNotFoundError(pollError)) {
        return <NotFound />;
    }

    return (
        <>
            <Helmet>
                <title>{poll ? poll.pollName : 'Vote'}</title>
            </Helmet>
            {isLoadingPoll && <CircularProgress sx={{ mt: 5 }} />}
            {pollError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {renderError(pollError)}
                </Alert>
            )}
            {pollId && poll && (
                <Box
                    sx={{
                        width: '100%',
                        maxWidth: 960,
                        px: { xs: 2, sm: 3 },
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}
                >
                    <PollHeader poll={poll} pollId={pollId} />
                    <Voting onVote={onVote} poll={poll} pollId={pollId} />
                    <VoteResults poll={poll} pollId={pollId} />
                    <Typography
                        p={2}
                        sx={{ textAlign: 'center' }}
                        variant="body1"
                    >
                        {poll.voters.length
                            ? `Voters in this poll: ${poll.voters.join(', ')}`
                            : 'No voters yet.'}
                    </Typography>
                </Box>
            )}
        </>
    );
};

export default PollPage;
