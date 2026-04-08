import React from 'react';

import VoteSharing from './VoteSharing';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { useAppDispatch, useAppSelector } from 'app/hooks';
import {
    useClosePollMutation,
    type PollResponse,
} from 'features/Polls/pollsApi';
import {
    forgetLocalVoteState,
    selectVotingStateByPollId,
} from 'features/Polls/votingSlice';
import { renderError } from 'utils/utils';

type PollHeaderProps = {
    poll: PollResponse;
    pollId: string;
};

const PollHeader = ({ poll, pollId }: PollHeaderProps): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const {
        creatorToken,
        pendingVoterName,
        pollSnapshot,
        privateKey,
        progressMessage,
        publicKey,
        results,
        selectedScores,
        voterName,
        voterToken,
        workflowError,
    } = useAppSelector((state) => selectVotingStateByPollId(state, pollId));

    const [closePoll, { isLoading: isClosingPoll, error: closeError }] =
        useClosePollMutation();
    const hasLocalVoteData = Boolean(
        creatorToken ||
        pendingVoterName ||
        pollSnapshot ||
        privateKey ||
        publicKey ||
        results ||
        selectedScores ||
        voterName ||
        voterToken,
    );

    const onClosePoll = (): void => {
        if (!creatorToken) {
            return;
        }

        void closePoll({ pollId, closeData: { creatorToken } });
    };
    const onForgetLocalData = (): void => {
        dispatch(forgetLocalVoteState({ pollId }));
    };

    return (
        <Panel className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                    Vote
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {poll.pollName}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                    Share the link below with participants. Once everyone has
                    voted, the results are ranked by geometric mean.
                </p>
            </div>
            <VoteSharing />
            {creatorToken && poll.isOpen && (
                <Panel
                    asChild
                    className="flex flex-col gap-4"
                    padding="compact"
                    radius="compact"
                    tone="subtle"
                >
                    <div>
                        <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                            You are the creator of this vote. When there are at
                            least two voters, including yourself, you can begin
                            the vote to lock registrations and calculate the
                            results.
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <Button
                                className="w-full sm:w-auto"
                                disabled={
                                    isClosingPoll || poll.voters.length < 2
                                }
                                onClick={onClosePoll}
                            >
                                Begin vote
                            </Button>
                            {hasLocalVoteData && (
                                <Button
                                    className="w-full sm:w-auto"
                                    onClick={onForgetLocalData}
                                    variant="outline"
                                >
                                    Forget local vote data
                                </Button>
                            )}
                        </div>
                        {closeError && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {renderError(closeError)}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </Panel>
            )}
            {!creatorToken && hasLocalVoteData && (
                <div className="flex justify-end">
                    <Button onClick={onForgetLocalData} variant="outline">
                        Forget local vote data
                    </Button>
                </div>
            )}
            <div className="space-y-3">
                {progressMessage && (
                    <Alert aria-live="polite" role="status" variant="info">
                        {!results && (
                            <Spinner
                                aria-hidden="true"
                                className="size-4"
                                role="presentation"
                            />
                        )}
                        <AlertDescription>{progressMessage}</AlertDescription>
                    </Alert>
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
