import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import React, { useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'app/hooks';
import { buildVotePageSeo } from 'app/seo';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    removeCreatorSession,
    saveCreatorSession,
} from 'features/Polls/creatorSessionStorage';
import { pollPollingIntervalMs } from 'features/Polls/pollQuery';
import { hasPublishedResults } from 'features/Polls/pollResults';
import { useGetPollQuery, type PollResponse } from 'features/Polls/pollsApi';
import {
    restoreCreatorSession,
    selectVotingStateByPollId,
} from 'features/Polls/votingSlice';
import { selectVoteStateByPollSlug } from 'features/Polls/votingState';
import { vote } from 'features/Polls/votingThunks/vote';
import { isConnectionError } from 'utils/networkErrors';

const isNotFoundError = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404;

export const usePollPageState = (
    pollSlug: string,
): {
    effectiveCreatorToken: string | null;
    effectivePoll: PollResponse | null;
    isLoadingPoll: boolean;
    onVote: (voterName: string, selectedScores: Record<string, number>) => void;
    pageSeo: ReturnType<typeof buildVotePageSeo>;
    pollError: FetchBaseQueryError | SerializedError | undefined;
    pollId: string | null;
    shouldShowConnectionState: boolean;
    shouldShowConnectionToast: boolean;
    shouldShowFatalError: boolean;
    shouldShowNotFound: boolean;
} => {
    const dispatch = useAppDispatch();
    const [activePollingIntervalMs, setActivePollingIntervalMs] = useState(
        pollPollingIntervalMs,
    );

    const {
        data: poll,
        isLoading: isLoadingPoll,
        error: pollError,
    } = useGetPollQuery(pollSlug, {
        pollingInterval: activePollingIntervalMs,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    const votingState = useAppSelector((state) =>
        selectVoteStateByPollSlug(state.voting, pollSlug),
    );
    const effectivePoll = poll ?? votingState.pollSnapshot ?? null;
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

    const onVote = React.useCallback(
        (voterName: string, selectedScores: Record<string, number>): void => {
            if (!pollId) {
                return;
            }

            void dispatch(
                vote({
                    pollId,
                    voterName,
                    selectedScores,
                }),
            );
        },
        [dispatch, pollId],
    );

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

    const hasPollData = !!pollId && !!effectivePoll;
    const hasConnectionError = isConnectionError(pollError);

    return {
        effectiveCreatorToken,
        effectivePoll,
        isLoadingPoll,
        onVote,
        pageSeo,
        pollError,
        pollId,
        shouldShowConnectionState:
            !hasPollData && !isLoadingPoll && hasConnectionError,
        shouldShowConnectionToast: hasPollData && hasConnectionError,
        shouldShowFatalError: !!pollError && !hasConnectionError,
        shouldShowNotFound: isNotFoundError(pollError),
    };
};
