import { skipToken } from '@reduxjs/toolkit/query';
import { isUuid } from '@sealed-vote/contracts';
import React, { useEffect, useState } from 'react';
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
    getResumableVoterName,
    hasPendingVotingIntent,
    selectVoteStateByPollSlug,
} from 'features/Polls/votingState';
import { recoverSession } from 'features/Polls/votingThunks/recoverSession';
import { vote } from 'features/Polls/votingThunks/vote';
import {
    connectionLostMessage,
    isConnectionError,
    renderError,
} from 'utils/utils';

const isNotFoundError = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404;

const defaultPollPollingIntervalMs = 5000;
const minimumPollPollingIntervalMs = 250;

const resolvePollPollingIntervalMs = (rawValue: string | undefined): number => {
    if (!rawValue) {
        return defaultPollPollingIntervalMs;
    }

    const parsedValue = Number(rawValue);

    if (
        !Number.isFinite(parsedValue) ||
        !Number.isInteger(parsedValue) ||
        parsedValue < minimumPollPollingIntervalMs
    ) {
        return defaultPollPollingIntervalMs;
    }

    return parsedValue;
};

const pollPollingIntervalMs = resolvePollPollingIntervalMs(
    import.meta.env.VITE_POLLING_INTERVAL_MS,
);

const getBrowserOnlineState = (): boolean =>
    typeof navigator === 'undefined' ? true : navigator.onLine;

const PollPage = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const { pollSlug } = useParams();
    const participantsHeadingId = React.useId();
    const isRecoveringSessionRef = React.useRef(false);

    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }
    const isLegacyPollLink = isUuid(pollSlug);
    const [activePollingIntervalMs, setActivePollingIntervalMs] = useState(
        pollPollingIntervalMs,
    );
    const [isBrowserOnline, setIsBrowserOnline] = useState(
        getBrowserOnlineState,
    );
    // Voting can advance in another tab or window, so background polling
    // must continue until the workflow reaches results.
    const {
        data: poll,
        isLoading: isLoadingPoll,
        error: pollError,
    } = useGetPollQuery(isLegacyPollLink ? skipToken : pollSlug, {
        pollingInterval: activePollingIntervalMs,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    const votingState = useAppSelector((state) =>
        selectVoteStateByPollSlug(state.voting, pollSlug),
    );
    const effectivePoll = poll ?? votingState.pollSnapshot;
    const pollId = effectivePoll?.id ?? null;
    const hasPendingVotingState = hasPendingVotingIntent(votingState);
    const resumableVoterName = getResumableVoterName(votingState);
    const selectedScores = votingState.selectedScores;
    const shouldResumeWorkflow = votingState.shouldResumeWorkflow;
    const isVotingInProgress = votingState.isVotingInProgress;
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

    useEffect(() => {
        const handleOnline = (): void => {
            setIsBrowserOnline(true);
        };
        const handleOffline = (): void => {
            setIsBrowserOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const hasResults =
            !!effectivePoll?.results.length || !!votingState.results?.length;

        setActivePollingIntervalMs(hasResults ? 0 : pollPollingIntervalMs);
    }, [effectivePoll?.results.length, votingState.results]);

    useEffect(() => {
        if (
            !pollId ||
            !isBrowserOnline ||
            isVotingInProgress ||
            isRecoveringSessionRef.current ||
            !shouldResumeWorkflow ||
            !hasPendingVotingState
        ) {
            return;
        }

        if (!resumableVoterName || !selectedScores) {
            return;
        }

        isRecoveringSessionRef.current = true;
        void Promise.resolve(dispatch(recoverSession({ pollId }))).finally(
            () => {
                isRecoveringSessionRef.current = false;
            },
        );
    }, [
        dispatch,
        hasPendingVotingState,
        isBrowserOnline,
        isVotingInProgress,
        pollId,
        resumableVoterName,
        selectedScores,
        shouldResumeWorkflow,
    ]);

    if (isLegacyPollLink || isNotFoundError(pollError)) {
        return <NotFound />;
    }

    const hasPollData = !!pollId && !!effectivePoll;
    const hasConnectionError = isConnectionError(pollError);
    const shouldShowConnectionToast = hasPollData && hasConnectionError;
    const shouldShowConnectionState =
        !hasPollData && !isLoadingPoll && hasConnectionError;
    const shouldShowFatalError = !!pollError && !hasConnectionError;

    return (
        <>
            <Helmet>
                <title>{effectivePoll ? effectivePoll.pollName : 'Vote'}</title>
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
                            {connectionLostMessage} Showing the latest available
                            vote state and retrying in the background.
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
                        <p className="text-sm leading-7 text-muted-foreground sm:text-base">
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
            {pollId && effectivePoll && (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                    <PollHeader poll={effectivePoll} pollId={pollId} />
                    <Voting
                        onVote={onVote}
                        poll={effectivePoll}
                        pollId={pollId}
                    />
                    <VoteResults poll={effectivePoll} pollId={pollId} />
                    <Panel
                        aria-labelledby={participantsHeadingId}
                        padding="compact"
                        tone="surface"
                    >
                        <h2
                            className="text-lg font-semibold tracking-tight"
                            id={participantsHeadingId}
                        >
                            Participants
                        </h2>
                        {effectivePoll.voters.length ? (
                            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                                {effectivePoll.voters.map((voterName) => (
                                    <Panel
                                        asChild
                                        className="min-w-0 break-words text-sm leading-6 text-foreground"
                                        key={voterName}
                                        padding="row"
                                        radius="compact"
                                        tone="subtle"
                                    >
                                        <li>{voterName}</li>
                                    </Panel>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                No voters yet.
                            </p>
                        )}
                    </Panel>
                </div>
            )}
        </>
    );
};

export default PollPage;
