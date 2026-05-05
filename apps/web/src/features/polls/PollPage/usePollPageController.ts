import React from 'react';

import { useClipboardNotice } from './useClipboardNotice';
import { usePollAutomaticCeremony } from './usePollAutomaticCeremony';
import { usePollCreatorActions } from './usePollCreatorActions';
import { usePollLocalState } from './usePollLocalState';
import { usePollVoteForm } from './usePollVoteForm';
import {
    buildNextStepExplanation,
    buildPrimaryExplanation,
    getPollRefreshInterval,
    steadyStatePollingIntervalMs,
} from './poll-page-helpers';
import {
    buildSubmittedVoterSummary,
    countAcceptedMessages,
} from './poll-page-formatters';
import type { PollPageReadyState } from './poll-page-view-models';

import { derivePollWorkflow } from '../poll-workflow';

import { useFetchPollQuery } from 'features/polls/polls-api';
import { siteOrigin } from '../../../../config/seo-metadata.mts';

type PollPageLoadingState = {
    status: 'loading';
    isFetching: boolean;
    isLoading: boolean;
};

type PollPageNotFoundState = {
    status: 'not-found';
};

type PollPageController =
    | PollPageLoadingState
    | PollPageNotFoundState
    | PollPageReadyState;

const isNotFoundError = (error: unknown): boolean =>
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404;

export const usePollPageController = (pollSlug: string): PollPageController => {
    const [localError, setLocalError] = React.useState<string | null>(null);
    const [localNotice, setLocalNotice] = React.useState<string | null>(null);
    const [pollingIntervalMs, setPollingIntervalMs] = React.useState(
        steadyStatePollingIntervalMs,
    );
    const {
        data: poll,
        error,
        isFetching,
        isLoading,
        refetch,
    } = useFetchPollQuery(pollSlug, {
        pollingInterval: pollingIntervalMs,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });

    const refetchPoll = React.useCallback(async (): Promise<unknown> => {
        return await refetch();
    }, [refetch]);

    const {
        creatorSession,
        deviceState,
        isLocalVoter,
        localCeremonyState,
        voterSession,
    } = usePollLocalState(poll);
    const creatorActions = usePollCreatorActions({
        creatorSession,
        poll,
        refetchPoll,
        setLocalError,
        setLocalNotice,
    });
    const voteForm = usePollVoteForm({
        creatorSession,
        poll,
        refetchPoll,
        setLocalError,
        setLocalNotice,
    });
    const automaticCeremony = usePollAutomaticCeremony({
        creatorSession,
        deviceState,
        isClosingVoting: creatorActions.isClosingVoting,
        isRestartingCeremony: creatorActions.isRestartingCeremony,
        localCeremonyState,
        poll,
        refetchPoll,
        setLocalError,
        setLocalNotice,
        voterSession,
    });
    const shareUrl = poll
        ? typeof window === 'undefined'
            ? new URL(`/polls/${poll.slug}`, siteOrigin).toString()
            : window.location.href
        : '';
    const clipboard = useClipboardNotice(shareUrl);

    React.useEffect(() => {
        const nextPollingInterval = getPollRefreshInterval(poll);

        setPollingIntervalMs((currentPollingInterval) =>
            currentPollingInterval === nextPollingInterval
                ? currentPollingInterval
                : nextPollingInterval,
        );
    }, [poll]);

    if (isNotFoundError(error)) {
        return { status: 'not-found' };
    }

    if (!poll) {
        return {
            status: 'loading',
            isFetching,
            isLoading,
        };
    }

    const workflow = derivePollWorkflow({
        creatorSessionPollId: creatorSession?.pollId ?? null,
        deviceState,
        hasAutomaticCeremonyAction:
            automaticCeremony.hasAutomaticCeremonyAction,
        hasAutomationFailure: automaticCeremony.automationError !== null,
        isSubmittingVote: voteForm.isSubmittingVote,
        poll,
        voterSession,
    });
    const submittedVoterSummary = buildSubmittedVoterSummary({
        count: poll.submittedVoterCount,
        minimum: poll.minimumCloseVoterCount,
    });
    const blockingVoters = poll.voters.filter((voter) =>
        poll.ceremony.blockingVoterIndices.includes(voter.voterIndex),
    );
    const isCreatorParticipant = !!deviceState?.isCreatorParticipant;
    const canSubmitVote =
        workflow.canSubmitVote && voteForm.canSubmitCompleteDraft;
    const canRestartCeremony =
        poll.phase === 'securing' &&
        poll.ceremony.activeParticipantCount - blockingVoters.length >=
            poll.minimumCloseVoterCount;
    const primaryExplanation = buildPrimaryExplanation({
        automaticActionDescription:
            automaticCeremony.currentAutomaticActionDescription,
        automationError: automaticCeremony.automationError,
        workflow,
    });
    const nextStepExplanation = buildNextStepExplanation({
        primaryExplanation,
        workflow,
    });

    return {
        alerts: {
            automationError: automaticCeremony.automationError,
            localError,
            localNotice,
        },
        audit: {
            acceptedKeyConfirmations: countAcceptedMessages(
                poll,
                'key-derivation-confirmation',
            ),
            acceptedManifestAcceptances: countAcceptedMessages(
                poll,
                'manifest-acceptance',
            ),
            acceptedRegistrations: countAcceptedMessages(poll, 'registration'),
            poll,
        },
        header: {
            canCopyShareUrl: clipboard.canCopy,
            copyNotice: clipboard.copyNotice,
            onCopyShareUrl: () => {
                void clipboard.onCopy();
            },
            poll,
            primaryExplanation,
            shareUrl,
            submittedVoterSummary,
        },
        nextStep: {
            automation: {
                activeActionSlotKey: automaticCeremony.activeActionSlotKey,
                isResolvingAutomaticAction:
                    automaticCeremony.isResolvingAutomaticAction,
                onRetryAutomation: automaticCeremony.retryAutomaticCeremony,
            },
            creatorControls: {
                isClosingVoting: creatorActions.isClosingVoting,
                isCreatorParticipant,
                onCloseVoting: () => {
                    void creatorActions.onCloseVoting({
                        canCloseVoting: workflow.canCloseVoting,
                    });
                },
            },
            localViewer: {
                isLocalVoter,
            },
            nextStepExplanation,
            poll,
            restartCeremony: {
                blockingVoters,
                canRestartCeremony,
                isRestartingCeremony: creatorActions.isRestartingCeremony,
                onRestartCeremony: () => {
                    void creatorActions.onRestartCeremony({
                        blockingVoters,
                        canRestartCeremony,
                    });
                },
            },
            voteForm: {
                canSubmitVote,
                draftScores: voteForm.draftScores,
                isSubmittingVote: voteForm.isSubmittingVote,
                onScoreChange: voteForm.onScoreChange,
                onSubmitVote: (event) => {
                    void voteForm.onSubmitVote(event, {
                        canSubmitVote,
                    });
                },
                setVoterName: voteForm.setVoterName,
                voterName: voteForm.voterName,
            },
            workflow,
        },
        refresh: {
            isFetching,
            isLoading,
        },
        results: {
            poll,
        },
        status: 'ready',
    };
};
