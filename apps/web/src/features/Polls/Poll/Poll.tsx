import { skipToken } from '@reduxjs/toolkit/query';
import { isUuid } from '@sealed-vote/contracts';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { useAppDispatch, useAppSelector } from 'app/hooks';
import NotFound from 'components/NotFound/NotFound';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import {
    hasResumableVotingSession,
    initialVoteState,
    selectVoteStateByPollId,
} from 'features/Polls/votingState';
import { vote } from 'features/Polls/votingThunks/vote';
import { isConnectionError, renderError } from 'utils/utils';

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

    const hasPollData = !!pollId && !!poll;
    const hasConnectionError = isConnectionError(pollError);
    const shouldShowConnectionToast = hasPollData && hasConnectionError;
    const shouldShowConnectionState =
        !hasPollData && !isLoadingPoll && hasConnectionError;
    const shouldShowFatalError = !!pollError && !hasConnectionError;

    return (
        <>
            <Helmet>
                <title>{poll ? poll.pollName : 'Vote'}</title>
            </Helmet>
            {isLoadingPoll && !hasPollData && (
                <div className="flex min-h-[40vh] items-center justify-center">
                    <Spinner className="size-10" />
                </div>
            )}
            {shouldShowConnectionToast && (
                <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
                    <Alert
                        aria-live="polite"
                        className="pointer-events-auto w-full max-w-xl border-border/70 bg-background/95 shadow-lg backdrop-blur"
                        data-slot="connection-toast"
                        role="status"
                        variant="info"
                    >
                        <Spinner
                            aria-hidden="true"
                            className="size-4"
                            role="presentation"
                        />
                        <AlertDescription>
                            Connection to the server was lost. Showing the
                            latest available vote state and retrying in the
                            background.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            {shouldShowConnectionState && (
                <Panel className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
                    <Spinner className="size-10" />
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Connection lost
                        </h1>
                        <p className="text-sm leading-7 text-secondary sm:text-base">
                            We lost the connection to the server. The app will
                            keep retrying in the background and will recover
                            automatically once the connection is back.
                        </p>
                    </div>
                </Panel>
            )}
            {shouldShowFatalError && (
                <Alert className="mx-auto mt-6 max-w-3xl" variant="destructive">
                    <AlertDescription>
                        {renderError(pollError)}
                    </AlertDescription>
                </Alert>
            )}
            {pollId && poll && (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                    <PollHeader poll={poll} pollId={pollId} />
                    <Voting onVote={onVote} poll={poll} pollId={pollId} />
                    <VoteResults poll={poll} pollId={pollId} />
                    <Panel padding="compact" tone="subtle">
                        <h2 className="text-lg font-semibold tracking-tight">
                            Participants
                        </h2>
                        <p className="mt-2 text-sm leading-7 text-secondary">
                            {poll.voters.length
                                ? `Voters in this poll: ${poll.voters.join(', ')}`
                                : 'No voters yet.'}
                        </p>
                    </Panel>
                </div>
            )}
        </>
    );
};

export default PollPage;
