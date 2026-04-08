import { skipToken } from '@reduxjs/toolkit/query';
import { isUuid } from '@sealed-vote/contracts';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { mutedBodyClassName, sectionTitleClassName } from '@/lib/uiClasses';
import DocumentSeo from 'app/DocumentSeo';
import { useAppDispatch, useAppSelector } from 'app/hooks';
import { buildVotePageSeo } from 'app/seo';
import NotFound from 'components/NotFound/NotFound';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    removeCreatorSession,
    saveCreatorSession,
} from 'features/Polls/creatorSessionStorage';
import {
    hasPublishedResults,
    normalizePollResponse,
} from 'features/Polls/pollData';
import { pollPollingIntervalMs } from 'features/Polls/pollQuery';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import {
    restoreCreatorSession,
    selectVotingStateByPollId,
} from 'features/Polls/votingSlice';
import { selectVoteStateByPollSlug } from 'features/Polls/votingState';
import { vote } from 'features/Polls/votingThunks/vote';
import {
    connectionLostMessage,
    isConnectionError,
    renderError,
} from 'utils/networkErrors';

const isNotFoundError = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404;

const PollPage = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const { pollSlug } = useParams();
    const participantsHeadingId = React.useId();

    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }
    const isLegacyPollLink = isUuid(pollSlug);
    const [activePollingIntervalMs, setActivePollingIntervalMs] = useState(
        pollPollingIntervalMs,
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
    const effectivePoll = normalizePollResponse(
        poll ?? votingState.pollSnapshot,
    );
    const pollId = effectivePoll?.id ?? null;
    const hasResults = hasPublishedResults(effectivePoll);
    const currentVoteState = useAppSelector((state) =>
        pollId ? selectVotingStateByPollId(state, pollId) : votingState,
    );
    const fallbackCreatorSession = React.useMemo(() => {
        if (!effectivePoll || hasResults || currentVoteState.creatorToken) {
            return null;
        }

        return (
            findCreatorSessionByPollId(effectivePoll.id) ??
            findCreatorSessionByPollSlug(effectivePoll.slug)
        );
    }, [currentVoteState.creatorToken, effectivePoll, hasResults]);
    const effectiveCreatorToken =
        currentVoteState.creatorToken ??
        fallbackCreatorSession?.creatorToken ??
        null;
    const runtimeOrigin =
        typeof window === 'undefined' ? undefined : window.location.origin;
    const pageSeo = buildVotePageSeo({
        origin: runtimeOrigin,
        pollPath: `/votes/${effectivePoll?.slug ?? pollSlug}`,
        pollSlug: effectivePoll?.slug ?? pollSlug,
        pollTitle: effectivePoll?.pollName,
        resultScores: effectivePoll?.resultScores,
    });
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
        setActivePollingIntervalMs(hasResults ? 0 : pollPollingIntervalMs);
    }, [hasResults]);

    useEffect(() => {
        if (!effectivePoll) {
            return;
        }

        if (hasResults) {
            removeCreatorSession(effectivePoll.id);
            return;
        }

        if (currentVoteState.creatorToken) {
            saveCreatorSession({
                creatorToken: currentVoteState.creatorToken,
                pollId: effectivePoll.id,
                pollSlug: effectivePoll.slug,
            });
            return;
        }

        if (!fallbackCreatorSession) {
            return;
        }

        dispatch(
            restoreCreatorSession({
                creatorToken: fallbackCreatorSession.creatorToken,
                pollId: effectivePoll.id,
                pollSlug: effectivePoll.slug,
            }),
        );
    }, [
        currentVoteState.creatorToken,
        dispatch,
        effectivePoll,
        effectivePoll?.id,
        effectivePoll?.slug,
        fallbackCreatorSession,
        hasResults,
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
            <DocumentSeo metadata={pageSeo} />
            {isLoadingPoll && !hasPollData && (
                <div className="flex flex-1 items-center justify-center">
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
                <Panel className="mx-auto flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-4 text-center">
                    <Spinner className="size-10" />
                    <div className="space-y-2">
                        <h1 className={sectionTitleClassName}>
                            Connection lost
                        </h1>
                        <p className={mutedBodyClassName}>
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
                    <PollHeader
                        creatorToken={effectiveCreatorToken}
                        poll={effectivePoll}
                        pollId={pollId}
                    />
                    <Voting
                        onVote={onVote}
                        poll={effectivePoll}
                        pollId={pollId}
                    />
                    <VoteResults poll={effectivePoll} pollId={pollId} />
                    <Panel asChild padding="compact" tone="surface">
                        <section aria-labelledby={participantsHeadingId}>
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
                        </section>
                    </Panel>
                </div>
            )}
        </>
    );
};

export default PollPage;
