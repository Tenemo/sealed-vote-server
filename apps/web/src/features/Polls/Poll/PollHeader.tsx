import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Typography,
} from '@mui/material';
import React from 'react';
import { useParams } from 'react-router-dom';

import VoteSharing from './VoteSharing';

import { useAppSelector } from 'app/hooks';
import {
    useClosePollMutation,
    useGetPollQuery,
    useRegisterVoterMutation,
} from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';
import { renderError } from 'utils/utils';

const PollHeader = (): React.JSX.Element => {
    const { pollId } = useParams();
    if (!pollId) {
        throw new Error('Poll ID missing.');
    }
    const { creatorToken, progressMessage, results } = useAppSelector((state) =>
        selectVotingStateByPollId(state, pollId),
    );
    const [, { error: registerError }] = useRegisterVoterMutation({
        fixedCacheKey: pollId,
    });
    const { data: poll } = useGetPollQuery(pollId);

    const [closePoll, { isLoading: isClosingPoll, error: closeError }] =
        useClosePollMutation();
    const onClosePoll = (): void => {
        if (!creatorToken) return;
        try {
            void closePoll({ pollId, closeData: { creatorToken } });
        } catch (error) {
            console.error('Error closing poll:', error);
        }
    };

    return (
        <Box
            p={2}
            sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                flexDirection: 'column',
                alignItems: 'flex-center',
            }}
        >
            <Typography mb={1} variant="h5">
                {poll?.pollName ? `Vote: ${poll?.pollName}` : ''}
            </Typography>
            {creatorToken && poll?.isOpen && (
                <Typography mb={1}>
                    You are the creator of this vote. When there will be more
                    than 1 voter, including yourself, you can begin the vote to
                    calculate the results and prevent any new votes.
                </Typography>
            )}

            {creatorToken && poll?.isOpen && (
                <>
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
                            disabled={isClosingPoll || poll?.voters.length < 2}
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
                </>
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
                {progressMessage && !registerError && (
                    <>
                        {!results && <CircularProgress />}
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {progressMessage}
                        </Alert>
                    </>
                )}
            </Box>
        </Box>
    );
};

export default PollHeader;
