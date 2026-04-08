import React from 'react';

import VoteSharing from './VoteSharing';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import {
    actionButtonClassName,
    mutedBodyClassName,
    pageTitleClassName,
} from '@/lib/uiClasses';
import { cn } from '@/lib/utils';
import { useAppSelector } from 'app/hooks';
import { hasPublishedResults } from 'features/Polls/pollData';
import {
    useClosePollMutation,
    type PollResponse,
} from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';
import { renderError } from 'utils/networkErrors';

type PollHeaderProps = {
    creatorToken: string | null;
    poll: PollResponse;
    pollId: string;
};

const formatPollCreationDate = (createdAt: string): string =>
    createdAt.slice(0, 10);

const PollHeader = ({
    creatorToken,
    poll,
    pollId,
}: PollHeaderProps): React.JSX.Element => {
    const { progressMessage, workflowError } = useAppSelector((state) =>
        selectVotingStateByPollId(state, pollId),
    );
    const hasResults = hasPublishedResults(poll);

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
                <p className="text-sm font-medium text-muted-foreground">
                    Vote
                </p>
                <h1 className={pageTitleClassName}>{poll.pollName}</h1>
                <p className="text-sm font-medium text-muted-foreground">
                    Created {formatPollCreationDate(poll.createdAt)}
                </p>
                <p className={cn(mutedBodyClassName, 'max-w-3xl')}>
                    {hasResults
                        ? 'Voting has completed. The results below are ordered by geometric mean.'
                        : 'Share the link below with participants. Once everyone has voted, the results are ordered by geometric mean.'}
                </p>
            </div>
            <VoteSharing pollTitle={poll.pollName} />
            {creatorToken && poll.isOpen && (
                <Panel
                    asChild
                    className="flex flex-col gap-4"
                    padding="compact"
                    radius="compact"
                    tone="subtle"
                >
                    <div>
                        <p className={mutedBodyClassName}>
                            You are the creator of this vote. When there are at
                            least two voters, including yourself, you can begin
                            the vote to lock registrations and calculate the
                            results.
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <Button
                                className={actionButtonClassName}
                                disabled={
                                    isClosingPoll || poll.voters.length < 2
                                }
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
                </Panel>
            )}
            <div className="space-y-3">
                {progressMessage && (
                    <Alert aria-live="polite" role="status" variant="info">
                        {!hasResults && (
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
