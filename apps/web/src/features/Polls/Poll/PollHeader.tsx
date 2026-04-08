import React from 'react';

import VoteSharing from './VoteSharing';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
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
        <Panel className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-medium text-secondary">Vote</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {poll.pollName}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-secondary sm:text-base">
                    Share the link below with participants. Once everyone has
                    voted, the results are ranked by geometric mean.
                </p>
            </div>
            <VoteSharing />
            {creatorToken && poll.isOpen && (
                <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-background/30 p-4">
                    <p className="text-sm leading-7 text-secondary sm:text-base">
                        You are the creator of this vote. When there are at
                        least two voters, including yourself, you can begin the
                        vote to lock registrations and calculate the results.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                            className="w-full sm:w-auto"
                            disabled={isClosingPoll || poll.voters.length < 2}
                            onClick={onClosePoll}
                        >
                            Begin vote
                        </Button>
                    </div>
                    {closeError && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {renderError(closeError)}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
            <div className="space-y-3">
                {progressMessage && (
                    <>
                        {!results && <Spinner className="size-6" />}
                        <Alert variant="info">
                            <AlertDescription>
                                {progressMessage}
                            </AlertDescription>
                        </Alert>
                    </>
                )}
                {workflowError && (
                    <Alert variant="destructive">
                        <AlertDescription>{workflowError}</AlertDescription>
                    </Alert>
                )}
            </div>
        </Panel>
    );
};

export default PollHeader;
