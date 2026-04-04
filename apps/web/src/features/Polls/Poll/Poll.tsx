import { Typography, Alert, CircularProgress } from '@mui/material';
import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { derivePollPhase } from '@sealed-vote/protocol';
import { useAppDispatch, useAppSelector } from 'app/hooks';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';
import { vote } from 'features/Polls/votingThunks/vote';
import { renderError } from 'utils/utils';

const PollPage = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const { pollId } = useParams();
    if (!pollId) {
        throw new Error('Poll ID missing.');
    }

    const { voterIndex, voterToken, selectedScores, results, voterName } =
        useAppSelector((state) => selectVotingStateByPollId(state, pollId));
    const {
        data: poll,
        isLoading: isLoadingPoll,
        error: pollError,
        refetch,
    } = useGetPollQuery(pollId);
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

    const shouldRefetchPoll =
        !!poll && derivePollPhase(poll) === 'registration';

    useEffect(() => {
        if (shouldRefetchPoll) {
            const pollInterval = setInterval(() => {
                void refetch();
                if (poll && !poll.isOpen) {
                    clearInterval(pollInterval);
                }
            }, 3000);

            return () => {
                clearInterval(pollInterval);
            };
        }
    }, [poll, refetch, shouldRefetchPoll]);

    useEffect(() => {
        if (
            selectedScores &&
            voterIndex &&
            voterName &&
            voterToken &&
            !results
        ) {
            void dispatch(vote({ pollId, voterName, selectedScores }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <Helmet>
                <title>
                    {poll
                        ? poll.pollName
                        : `Vote ${pollId?.split('-')?.[0] ?? ''}`}
                </title>
            </Helmet>
            <PollHeader />
            {(() => {
                if (isLoadingPoll) {
                    return <CircularProgress sx={{ mt: 5 }} />;
                }

                if (pollError) {
                    return (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {renderError(pollError)}
                        </Alert>
                    );
                }

                return (
                    <>
                        <Voting
                            choices={poll?.choices ?? []}
                            onVote={onVote}
                            pollId={pollId}
                        />
                        <VoteResults />
                        <Typography p={2} variant="body1">
                            {poll?.voters?.length
                                ? `Voters in this poll: ${poll?.voters.join(', ')}`
                                : 'No voters yet.'}
                        </Typography>
                    </>
                );
            })()}
        </>
    );
};

export default PollPage;
