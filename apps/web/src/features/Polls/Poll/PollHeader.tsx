import React from 'react';

import VoteSharing from './VoteSharing';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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
        <div className="flex w-full flex-col items-center p-2">
            <h2 className="mb-2 text-xl font-semibold">
                Vote: {poll.pollName}
            </h2>
            {creatorToken && poll.isOpen && (
                <p className="mb-2 w-full">
                    You are the creator of this vote. When there will be more
                    than 1 voter, including yourself, you can begin the vote to
                    calculate the results and prevent any new votes.
                </p>
            )}

            {creatorToken && poll.isOpen && (
                <div className="mb-1 flex w-full flex-col items-start">
                    <Button
                        disabled={isClosingPoll || poll.voters.length < 2}
                        onClick={onClosePoll}
                        variant="warning"
                    >
                        Begin vote
                    </Button>
                    {closeError && (
                        <Alert className="mt-2" variant="destructive">
                            <AlertDescription>
                                {renderError(closeError)}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
            <VoteSharing />
            <div className="flex w-full flex-col items-center justify-center">
                {progressMessage && (
                    <>
                        {!results && <Spinner className="size-6" />}
                        <Alert className="mt-2" variant="info">
                            <AlertDescription>
                                {progressMessage}
                            </AlertDescription>
                        </Alert>
                    </>
                )}
                {workflowError && (
                    <Alert className="mt-2" variant="destructive">
                        <AlertDescription>{workflowError}</AlertDescription>
                    </Alert>
                )}
            </div>
        </div>
    );
};

export default PollHeader;
