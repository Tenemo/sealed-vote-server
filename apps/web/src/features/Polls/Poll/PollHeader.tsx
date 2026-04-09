import React from 'react';

import VoteSharing from './VoteSharing';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { actionButtonClassName, pageTitleClassName } from '@/lib/uiClasses';
import { useAppSelector } from 'app/hooks';
import LoadingButton from 'components/LoadingButton';
import { hasPublishedResults } from 'features/Polls/pollResults';
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
        <Panel className="flex flex-col gap-6">
            <div className="space-y-4">
                <div className="space-y-3">
                    <p className="text-sm font-medium text-secondary">Vote</p>
                    <h1 className={pageTitleClassName}>{poll.pollName}</h1>
                    <p className="text-sm font-medium text-secondary">
                        Created on {formatPollCreationDate(poll.createdAt)}
                    </p>
                    <p className="page-lead max-w-3xl">
                        {hasResults
                            ? 'Voting has completed. The results below are ordered by geometric mean.'
                            : 'Share the link below with participants. Once everyone has voted, the results are ordered by geometric mean.'}
                    </p>
                </div>
                {hasResults && (
                    <Alert>
                        <AlertDescription>
                            Voting has completed. You can still review the final
                            results and the participants list below.
                        </AlertDescription>
                    </Alert>
                )}
                {progressMessage && (
                    <Alert announcement="polite" variant="info">
                        {!hasResults && (
                            <Spinner
                                aria-hidden="true"
                                className="size-4"
                                label={null}
                            />
                        )}
                        <AlertDescription>{progressMessage}</AlertDescription>
                    </Alert>
                )}
                {workflowError && (
                    <Alert announcement="assertive" variant="destructive">
                        <AlertDescription>{workflowError}</AlertDescription>
                    </Alert>
                )}
                <VoteSharing pollTitle={poll.pollName} />
            </div>
            {creatorToken && poll.isOpen && (
                <div className="grid gap-3 border-t border-border pt-6">
                    {closeError && (
                        <Alert announcement="assertive" variant="destructive">
                            <AlertDescription>
                                {renderError(closeError)}
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="grid w-full gap-2">
                        {poll.voters.length < 2 && (
                            <p className="field-note" id="begin-vote-helper">
                                At least 2 people must vote before you can begin
                                the vote and calculate results.
                            </p>
                        )}
                        <p className="field-note">
                            You are the creator of this vote. When there are at
                            least two voters, including yourself, you can begin
                            the vote to lock registrations and calculate the
                            results.
                        </p>
                        <div className="flex justify-end">
                            <LoadingButton
                                aria-describedby={
                                    poll.voters.length < 2
                                        ? 'begin-vote-helper'
                                        : undefined
                                }
                                className={actionButtonClassName}
                                disabled={
                                    isClosingPoll || poll.voters.length < 2
                                }
                                loading={isClosingPoll}
                                loadingLabel="Beginning vote"
                                onClick={onClosePoll}
                            >
                                Begin vote
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            )}
        </Panel>
    );
};

export default PollHeader;
