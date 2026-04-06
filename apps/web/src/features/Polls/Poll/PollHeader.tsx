import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Typography,
} from '@mui/material';
import React from 'react';

import VoteSharing from './VoteSharing';

import { useAppSelector } from 'app/hooks';
import {
    useClosePollMutation,
    type PollResponse,
} from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';
import { renderError } from 'utils/utils';

type PollHeaderProps = {
    poll: PollResponse;
    pollId: string;
};

const PollHeader = ({ poll, pollId }: PollHeaderProps): React.JSX.Element => {
    const { creatorToken, progressMessage, results, workflowError } =
        useAppSelector((state) => selectVotingStateByPollId(state, pollId));

    const [closePoll, { isLoading: isClosingPoll, error: closeError }] =
        useClosePollMutation();
    const onClosePoll = (): void => {
        if (!creatorToken) {
            return;
        }

        void closePoll({ pollId, closeData: { creatorToken } });
    };

    return (
        <Box
            p={2}
            sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                flexDirection: 'column',
                alignItems: 'center',
            }}
        >
            <Typography mb={1} variant="h5">
                Vote: {poll.pollName}
            </Typography>
            {creatorToken && poll.isOpen && (
                <Typography mb={1}>
                    You are the creator of this vote. When there will be more
                    than 1 voter, including yourself, you can begin the vote to
                    calculate the results and prevent any new votes.
                </Typography>
            )}

            {creatorToken && poll.isOpen && (
                <Box
                    mb={1}
                    sx={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'flex-start',
                        flexDirection: 'column',
                    }}
                >
                    <Button
                        color="warning"
                        disabled={isClosingPoll || poll.voters.length < 2}
                        onClick={onClosePoll}
                        variant="contained"
                    >
                        Begin vote
                    </Button>
                    {closeError && (
                        <Alert severity="error">
                            {renderError(closeError)}
                        </Alert>
                    )}
                </Box>
            )}
            <VoteSharing />
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    width: '100%',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                {progressMessage && (
                    <>
                        {!results && <CircularProgress />}
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {progressMessage}
                        </Alert>
                    </>
                )}
                {workflowError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {workflowError}
                    </Alert>
                )}
            </Box>
        </Box>
    );
};

export default PollHeader;
