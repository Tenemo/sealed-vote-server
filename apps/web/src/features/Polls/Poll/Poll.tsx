import React from 'react';
import { useParams } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { mutedBodyClassName, pageTitleClassName } from '@/lib/uiClasses';
import LoadingButton from 'components/LoadingButton/LoadingButton';
import NotFound from 'components/NotFound/NotFound';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    saveVoterSession,
} from 'features/Polls/pollSessionStorage';
import { generateClientToken } from 'features/Polls/clientToken';
import {
    clearCommittedPendingPayload,
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
    type PreparedCeremonyAction,
} from 'features/Polls/pollBoardActions';
import {
    clearStoredBallotScores,
    createPendingPollDeviceState,
    createPollDeviceState,
    findPollDeviceStateByPollId,
    findPollDeviceStateByPollSlug,
    savePollDeviceState,
} from 'features/Polls/pollDeviceStorage';
import {
    getPollRefreshInterval,
    steadyStatePollingIntervalMs,
} from 'features/Polls/pollRefreshInterval';
import { derivePollWorkflow } from 'features/Polls/pollWorkflow';
import {
    useCloseVotingMutation,
    useGetPollQuery,
    usePostBoardMessageMutation,
    useRegisterVoterMutation,
    useRestartCeremonyMutation,
} from 'features/Polls/pollsApi';
import { renderError } from 'utils/networkErrors';

const minimumScore = 1;
const maximumScore = 10;
const scoreOptions = Array.from(
    { length: maximumScore - minimumScore + 1 },
    (_value, offset) => minimumScore + offset,
);

type PollData = NonNullable<ReturnType<typeof useGetPollQuery>['data']>;
type PollBoardEntry = PollData['boardEntries'][number];

const phaseLabel = (phase: string): string =>
    (
        ({
            aborted: 'Ceremony aborted',
            complete: 'Verified results',
            open: 'Voting open',
            'ready-to-reveal': 'Starting reveal',
            revealing: 'Revealing results',
            securing: 'Securing the election',
        }) satisfies Record<string, string>
    )[phase] ?? phase;

const createEmptyScores = (choiceCount: number): (number | null)[] =>
    Array.from({ length: choiceCount }, () => null);

const formatDateTime = (value: string): string =>
    new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

const countAcceptedMessages = (poll: PollData, messageType: string): number =>
    poll.boardEntries.filter(
        (entry: PollBoardEntry) =>
            entry.classification === 'accepted' &&
            entry.signedPayload.payload.sessionId === poll.sessionId &&
            entry.messageType === messageType,
    ).length;

const humanizeBoardMessageType = (messageType: string): string =>
    messageType.replaceAll('-', ' ');

const formatBoardEntryTitle = (
    entry: PollBoardEntry,
    poll: PollData,
): string => {
    const payload = entry.signedPayload.payload as Record<string, unknown>;
    const baseTitle = `Participant ${entry.participantIndex}. ${humanizeBoardMessageType(entry.messageType)}`;

    if (
        typeof payload.optionIndex === 'number' &&
        Number.isInteger(payload.optionIndex)
    ) {
        const choiceName = poll.choices[payload.optionIndex - 1];

        return choiceName
            ? `${baseTitle} for ${choiceName}`
            : `${baseTitle} for choice ${payload.optionIndex}`;
    }

    if (
        typeof payload.recipientIndex === 'number' &&
        Number.isInteger(payload.recipientIndex)
    ) {
        return `${baseTitle} for participant ${payload.recipientIndex}`;
    }

    if (Array.isArray(payload.includedParticipantIndices)) {
        return `${baseTitle} counting ${payload.includedParticipantIndices.length} participants`;
    }

    return baseTitle;
};

const formatBoardEntryStatus = (entry: PollBoardEntry): string => {
    const classification =
        entry.classification.charAt(0).toUpperCase() +
        entry.classification.slice(1);

    return `${classification} | ${formatDateTime(entry.createdAt)}`;
};

const formatRevealStatus = (poll: PollData): string => {
    if (poll.phase === 'aborted') {
        return 'Aborted';
    }

    if (poll.phase === 'complete') {
        return 'Complete';
    }

    if (poll.phase === 'revealing') {
        return 'Started';
    }

    if (poll.phase === 'ready-to-reveal') {
        return 'Starting';
    }

    if (poll.ceremony.revealReady) {
        return 'Ready';
    }

    return poll.phase === 'open'
        ? 'Pending close'
        : 'Waiting for complete ballots';
};

const isPollParticipantLocal = ({
    devicePollId,
    pollId,
    voterPollId,
}: {
    devicePollId: string | null | undefined;
    pollId: string;
    voterPollId: string | null | undefined;
}): boolean => devicePollId === pollId && voterPollId === pollId;

const buildParticipantSummary = ({
    count,
    minimum,
}: {
    count: number;
    minimum: number;
}): string =>
    count >= minimum
        ? `${count} submitted before close`
        : `${count} submitted, ${minimum - count} more needed before close`;

const PollPage = (): React.JSX.Element => {
    const { pollSlug } = useParams();
    const [registerVoter, registerState] = useRegisterVoterMutation();
    const [closeVoting, closeState] = useCloseVotingMutation();
    const [restartCeremony, restartState] = useRestartCeremonyMutation();
    const [postBoardMessage] = usePostBoardMessageMutation();
    const [voterName, setVoterName] = React.useState('');
    const [draftScores, setDraftScores] = React.useState<(number | null)[]>([]);
    const [localError, setLocalError] = React.useState<string | null>(null);
    const [localNotice, setLocalNotice] = React.useState<string | null>(null);
    const [automationError, setAutomationError] = React.useState<string | null>(
        null,
    );
    const [automaticAction, setAutomaticAction] =
        React.useState<PreparedCeremonyAction | null>(null);
    const [automaticActionDescription, setAutomaticActionDescription] =
        React.useState<string | null>(null);
    const [isResolvingAutomaticAction, setIsResolvingAutomaticAction] =
        React.useState(false);
    const [automaticResolutionAttempt, setAutomaticResolutionAttempt] =
        React.useState(0);
    const [activeActionSlotKey, setActiveActionSlotKey] = React.useState<
        string | null
    >(null);
    const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
    const [pollingIntervalMs, setPollingIntervalMs] = React.useState(
        steadyStatePollingIntervalMs,
    );

    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }

    const {
        data: poll,
        error,
        isFetching,
        isLoading,
        refetch,
    } = useGetPollQuery(pollSlug, {
        pollingInterval: pollingIntervalMs,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });

    const creatorSession = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findCreatorSessionByPollId(poll.id) ??
            findCreatorSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const voterSession = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findVoterSessionByPollId(poll.id) ??
            findVoterSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const deviceState = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findPollDeviceStateByPollId(poll.id) ??
            findPollDeviceStateByPollSlug(poll.slug)
        );
    }, [poll]);

    React.useEffect(() => {
        if (!poll) {
            return;
        }

        setDraftScores((currentScores) =>
            currentScores.length === poll.choices.length
                ? currentScores
                : createEmptyScores(poll.choices.length),
        );
    }, [poll]);

    React.useEffect(() => {
        const nextPollingInterval = getPollRefreshInterval(poll);

        setPollingIntervalMs((currentPollingInterval) =>
            currentPollingInterval === nextPollingInterval
                ? currentPollingInterval
                : nextPollingInterval,
        );
    }, [poll]);

    React.useEffect(() => {
        if (!copyNotice || typeof window.setTimeout !== 'function') {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setCopyNotice(null);
        }, 2_000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [copyNotice]);

    React.useEffect(() => {
        let cancelled = false;

        const resolveAction = async (): Promise<void> => {
            const localCeremonyState = voterSession
                ? (poll?.voters.find(
                      (participant) =>
                          participant.voterIndex === voterSession.voterIndex,
                  )?.ceremonyState ?? null)
                : null;

            if (!poll || poll.phase === 'open' || poll.phase === 'complete') {
                if (cancelled) {
                    return;
                }

                setAutomaticAction(null);
                setAutomaticActionDescription(null);
                setAutomationError(null);
                setIsResolvingAutomaticAction(false);
                return;
            }

            if (localCeremonyState === 'skipped') {
                if (cancelled) {
                    return;
                }

                setAutomaticAction(null);
                setAutomaticActionDescription(null);
                setAutomationError(null);
                setIsResolvingAutomaticAction(false);
                return;
            }

            if (activeActionSlotKey) {
                return;
            }

            setIsResolvingAutomaticAction(true);

            try {
                const nextAction = await resolveAutomaticCeremonyAction({
                    creatorSession,
                    deviceState,
                    poll,
                    shouldAbort: () => cancelled,
                    voterSession,
                });

                if (cancelled) {
                    return;
                }

                setAutomaticAction(nextAction);
                setAutomaticActionDescription(
                    describeAutomaticCeremonyAction(nextAction),
                );
                setAutomationError(null);
            } catch (resolutionError) {
                if (cancelled) {
                    return;
                }

                setAutomaticAction(null);
                setAutomaticActionDescription(null);
                setAutomationError(renderError(resolutionError));
            } finally {
                if (!cancelled) {
                    setIsResolvingAutomaticAction(false);
                }
            }
        };

        void resolveAction();

        return () => {
            cancelled = true;
        };
    }, [
        activeActionSlotKey,
        automaticResolutionAttempt,
        creatorSession,
        deviceState,
        poll,
        voterSession,
    ]);

    React.useEffect(() => {
        if (!poll || !deviceState) {
            return;
        }

        const localCeremonyState = voterSession
            ? (poll.voters.find(
                  (participant) =>
                      participant.voterIndex === voterSession.voterIndex,
              )?.ceremonyState ?? null)
            : null;

        if (
            deviceState.storedBallotScores !== null &&
            (poll.phase === 'complete' ||
                poll.phase === 'aborted' ||
                localCeremonyState === 'skipped')
        ) {
            clearStoredBallotScores(poll.id);
        }
    }, [deviceState, poll, voterSession]);

    const submitPreparedAction = React.useCallback(
        async (action: PreparedCeremonyAction): Promise<void> => {
            if (!poll || !voterSession) {
                return;
            }

            setLocalError(null);
            setLocalNotice(null);
            setAutomationError(null);
            setAutomaticAction(null);
            setAutomaticActionDescription(null);
            setActiveActionSlotKey(action.slotKey);

            try {
                await postBoardMessage({
                    pollId: poll.id,
                    boardMessage: {
                        signedPayload: action.signedPayload,
                        voterToken: voterSession.voterToken,
                    },
                }).unwrap();

                clearCommittedPendingPayload({
                    pollId: poll.id,
                    slotKey: action.slotKey,
                });
                await refetch();
            } catch (submissionError) {
                setAutomationError(renderError(submissionError));
            } finally {
                setActiveActionSlotKey(null);
            }
        },
        [poll, postBoardMessage, refetch, voterSession],
    );

    React.useEffect(() => {
        const isSkippedLocally = voterSession
            ? poll?.voters.find(
                  (participant) =>
                      participant.voterIndex === voterSession.voterIndex,
              )?.ceremonyState === 'skipped'
            : false;

        if (
            !poll ||
            isSkippedLocally ||
            (poll.phase !== 'securing' &&
                poll.phase !== 'ready-to-reveal' &&
                poll.phase !== 'revealing') ||
            !automaticAction ||
            !!activeActionSlotKey ||
            !!automationError
        ) {
            return;
        }

        void submitPreparedAction(automaticAction);
    }, [
        activeActionSlotKey,
        automaticAction,
        automationError,
        poll,
        submitPreparedAction,
        voterSession,
    ]);

    if (
        error &&
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 404
    ) {
        return <NotFound />;
    }

    if (!poll) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Panel className="loading-panel max-w-xl">
                    <Spinner className="size-10" />
                </Panel>
            </div>
        );
    }

    const submittedParticipantSummary = buildParticipantSummary({
        count: poll.submittedParticipantCount,
        minimum: poll.minimumCloseParticipantCount,
    });
    const shareUrl =
        typeof window === 'undefined'
            ? `https://sealed.vote/votes/${poll.slug}`
            : window.location.href;
    const localParticipant = isPollParticipantLocal({
        devicePollId: deviceState?.pollId,
        pollId: poll.id,
        voterPollId: voterSession?.pollId,
    });
    const workflow = derivePollWorkflow({
        creatorSessionPollId: creatorSession?.pollId ?? null,
        deviceState,
        hasAutomaticCeremonyAction: automaticAction !== null,
        hasAutomationFailure: automationError !== null,
        isSubmittingVote: registerState.isLoading,
        poll,
        voterSession,
    });
    const hasCompleteDraft = draftScores.every((score) => score !== null);
    const isCreatorParticipant = !!deviceState?.isCreatorParticipant;
    const acceptedRegistrations = countAcceptedMessages(poll, 'registration');
    const acceptedManifestAcceptances = countAcceptedMessages(
        poll,
        'manifest-acceptance',
    );
    const acceptedKeyConfirmations = countAcceptedMessages(
        poll,
        'key-derivation-confirmation',
    );
    const canSubmitVote =
        workflow.canSubmitVote &&
        !registerState.isLoading &&
        !!voterName.trim() &&
        hasCompleteDraft;
    const canCopyShareUrl =
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function';
    const blockingParticipants = poll.voters.filter((participant) =>
        poll.ceremony.blockingParticipantIndices.includes(
            participant.voterIndex,
        ),
    );
    const canRestartCeremony =
        poll.phase === 'securing' &&
        poll.ceremony.activeParticipantCount - blockingParticipants.length >=
            poll.minimumCloseParticipantCount;

    const onScoreChange = (choiceIndex: number, score: number): void => {
        setDraftScores((currentScores) =>
            currentScores.map((currentScore, index) =>
                index === choiceIndex ? score : currentScore,
            ),
        );
    };

    const onCopyShareUrl = async (): Promise<void> => {
        if (!canCopyShareUrl) {
            return;
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopyNotice('Link copied.');
        } catch {
            setCopyNotice('Copy failed.');
        }
    };

    const onSubmitVote = async (
        event: React.FormEvent<HTMLFormElement>,
    ): Promise<void> => {
        event.preventDefault();

        const normalizedVoterName = voterName.trim();

        if (!canSubmitVote || !poll) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            const pendingState = await createPendingPollDeviceState();
            const voterToken = generateClientToken();
            const response = await registerVoter({
                pollId: poll.id,
                voterData: {
                    authPublicKey: pendingState.authPublicKey,
                    creatorToken:
                        creatorSession?.pollId === poll.id
                            ? creatorSession.creatorToken
                            : undefined,
                    transportPublicKey: pendingState.transportPublicKey,
                    transportSuite: pendingState.transportSuite,
                    voterName: normalizedVoterName,
                    voterToken,
                },
            }).unwrap();

            const storedScores = draftScores.map((score) => {
                if (score === null) {
                    throw new Error(
                        'Every option must have a score before submission.',
                    );
                }

                return score;
            });
            const nextDeviceState = await createPollDeviceState({
                pendingState,
                pollId: poll.id,
                pollSlug: poll.slug,
                storedBallotScores: storedScores,
                voterIndex: response.voterIndex,
                voterName: response.voterName,
                voterToken: response.voterToken,
                isCreatorParticipant: creatorSession?.pollId === poll.id,
            });

            savePollDeviceState(nextDeviceState);
            saveVoterSession({
                pollId: poll.id,
                pollSlug: poll.slug,
                voterIndex: response.voterIndex,
                voterName: response.voterName,
                voterToken: response.voterToken,
            });
            setLocalNotice(
                'Vote stored on this device. You can close the app and come back after voting closes.',
            );
            await refetch();
        } catch (submissionError) {
            setLocalError(renderError(submissionError));
        }
    };

    const onCloseVoting = async (): Promise<void> => {
        if (!creatorSession || !workflow.canCloseVoting) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            await closeVoting({
                pollId: poll.id,
                closeData: {
                    creatorToken: creatorSession.creatorToken,
                },
            }).unwrap();
            setLocalNotice(
                'Voting closed. The submitted roster is now being secured.',
            );
            await refetch();
        } catch (closeError) {
            setLocalError(renderError(closeError));
        }
    };

    const onRestartCeremony = async (): Promise<void> => {
        if (
            !creatorSession ||
            poll.phase !== 'securing' ||
            blockingParticipants.length === 0 ||
            !canRestartCeremony
        ) {
            return;
        }

        const blockedNames = blockingParticipants
            .map((participant) => participant.voterName)
            .join(', ');
        const confirmed =
            typeof window === 'undefined' ||
            window.confirm(
                `Continue without ${blockedNames}? Their locally stored votes will not be counted for this closed vote.`,
            );

        if (!confirmed) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            await restartCeremony({
                pollId: poll.id,
                restartData: {
                    creatorToken: creatorSession.creatorToken,
                },
            }).unwrap();
            setLocalNotice(
                `Continuing without ${blockedNames}. Those votes will not be counted unless those devices had already finished the active ceremony session.`,
            );
            await refetch();
        } catch (restartError) {
            setLocalError(renderError(restartError));
        }
    };

    const primaryExplanation =
        workflow.currentStep === 'anonymous-ready-to-vote'
            ? 'Score every option from 1 to 10, submit once, and come back after the organizer closes voting.'
            : workflow.currentStep === 'submitting-vote'
              ? 'Saving your final local vote and registering this device for the later ceremony.'
              : workflow.currentStep === 'creator-must-submit-first'
                ? 'You still need to submit your own vote from this browser before you can close voting.'
                : workflow.currentStep === 'vote-stored-waiting-for-close'
                  ? 'Your plaintext scores are stored only on this device until the organizer closes voting.'
                  : workflow.currentStep === 'creator-can-close'
                    ? 'Everyone who submitted before you close will be included. Everyone else stays out.'
                    : workflow.currentStep === 'securing-auto'
                      ? (automaticActionDescription ??
                        'Securing the election in the background.')
                      : workflow.currentStep === 'automation-retry-required'
                        ? (automationError ??
                          'Automatic ceremony progress needs a retry from this browser.')
                        : workflow.currentStep === 'securing-waiting'
                          ? 'Waiting for the rest of the group to finish the secure setup and encrypted ballot publication.'
                          : workflow.currentStep === 'skipped'
                            ? 'The organizer continued without this device. Your locally stored vote was not counted for this closed vote.'
                            : workflow.currentStep === 'revealing-auto'
                              ? (automaticActionDescription ??
                                'Starting the reveal and publishing decryption material in the background.')
                              : workflow.currentStep === 'revealing-waiting'
                                ? 'Waiting for threshold decryption shares and final tally publication.'
                                : workflow.currentStep === 'waiting-for-results'
                                  ? 'The ceremony is moving without any action needed from this browser.'
                                  : workflow.currentStep ===
                                      'local-vote-missing'
                                    ? 'This browser no longer has the local vote and device state required to continue after close.'
                                    : workflow.currentStep === 'complete'
                                      ? 'Every result shown below was replayed and verified from the public board log.'
                                      : 'The ceremony could not be verified from the public board log.';
    const nextStepExplanation =
        workflow.currentStep === 'skipped'
            ? 'No further action is required on this device.'
            : primaryExplanation;

    return (
        <section className="mx-auto w-full max-w-[96rem] space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(21rem,1fr)]">
                <div className="space-y-6">
                    <Panel className="space-y-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-3">
                                <p className="text-sm text-secondary">
                                    {phaseLabel(poll.phase)}
                                </p>
                                <h1 className={pageTitleClassName}>
                                    {poll.pollName}
                                </h1>
                                <p className="page-lead max-w-3xl">
                                    {primaryExplanation}
                                </p>
                            </div>
                            <div className="grid gap-2 text-sm text-secondary sm:grid-cols-2 lg:grid-cols-1">
                                <div>
                                    <div className="font-medium text-foreground">
                                        Created
                                    </div>
                                    <div>{formatDateTime(poll.createdAt)}</div>
                                </div>
                                <div>
                                    <div className="font-medium text-foreground">
                                        Submitted participants
                                    </div>
                                    <div>{submittedParticipantSummary}</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div className="space-y-2">
                                <div className="text-sm font-medium text-foreground">
                                    Shareable vote link
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3 text-sm break-all">
                                    {shareUrl}
                                </div>
                                {copyNotice ? (
                                    <p className={mutedBodyClassName}>
                                        {copyNotice}
                                    </p>
                                ) : null}
                            </div>
                            <Button
                                disabled={!canCopyShareUrl}
                                onClick={() => {
                                    void onCopyShareUrl();
                                }}
                                size="lg"
                                variant="outline"
                            >
                                Copy link
                            </Button>
                        </div>
                    </Panel>

                    {(localError || automationError || localNotice) && (
                        <div className="space-y-3">
                            {localError ? (
                                <Alert
                                    announcement="assertive"
                                    variant="destructive"
                                >
                                    <AlertDescription>
                                        {localError}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            {automationError ? (
                                <Alert
                                    announcement="polite"
                                    variant="destructive"
                                >
                                    <AlertDescription>
                                        {automationError}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            {localNotice ? (
                                <Alert announcement="polite" variant="success">
                                    <AlertDescription>
                                        {localNotice}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                        </div>
                    )}

                    <Panel className="space-y-5">
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">
                                Your next step
                            </h2>
                            <p className={mutedBodyClassName}>
                                {nextStepExplanation}
                            </p>
                        </div>

                        {creatorSession?.pollId === poll.id &&
                        poll.phase === 'securing' &&
                        blockingParticipants.length > 0 ? (
                            <Alert announcement="polite" variant="info">
                                <AlertDescription>
                                    <div className="space-y-3">
                                        <p>
                                            Ceremony progress is waiting on{' '}
                                            {blockingParticipants
                                                .map(
                                                    (participant) =>
                                                        participant.voterName,
                                                )
                                                .join(', ')}
                                            . If you continue without them, any
                                            votes still trapped on those devices
                                            will be skipped for this closed
                                            vote.
                                        </p>
                                        {!canRestartCeremony ? (
                                            <p className="text-sm text-secondary">
                                                A rescue becomes available only
                                                once removing the currently
                                                blocking devices would still
                                                leave at least{' '}
                                                {
                                                    poll.minimumCloseParticipantCount
                                                }{' '}
                                                active participants in the
                                                ceremony.
                                            </p>
                                        ) : null}
                                        {canRestartCeremony ? (
                                            <div className="flex flex-wrap justify-end gap-3">
                                                <LoadingButton
                                                    className="w-full sm:w-auto"
                                                    loading={
                                                        restartState.isLoading
                                                    }
                                                    loadingLabel="Continuing ceremony"
                                                    onClick={() => {
                                                        void onRestartCeremony();
                                                    }}
                                                    size="lg"
                                                    variant="outline"
                                                >
                                                    Continue without missing
                                                    participants
                                                </LoadingButton>
                                            </div>
                                        ) : null}
                                    </div>
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {poll.phase === 'open' && !localParticipant ? (
                            <form
                                className="space-y-6"
                                noValidate
                                onSubmit={(event) => {
                                    void onSubmitVote(event);
                                }}
                            >
                                <div className="space-y-2">
                                    <label
                                        className="text-sm font-medium"
                                        htmlFor="poll-voter-name"
                                    >
                                        Your public name
                                    </label>
                                    <input
                                        autoComplete="nickname"
                                        className="flex h-10 w-full rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        id="poll-voter-name"
                                        maxLength={32}
                                        onChange={(event) => {
                                            setVoterName(event.target.value);
                                        }}
                                        placeholder="How should the roster show you?"
                                        value={voterName}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h3 className="text-base font-semibold">
                                            Score every option
                                        </h3>
                                        <p className={mutedBodyClassName}>
                                            Every option must get one score from
                                            1 to 10. You can submit only once.
                                        </p>
                                    </div>

                                    {poll.choices.map((choice, choiceIndex) => (
                                        <div
                                            className="space-y-3 rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4"
                                            key={choice}
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-medium text-foreground">
                                                        {choice}
                                                    </div>
                                                    <div className="text-sm text-secondary">
                                                        {draftScores[
                                                            choiceIndex
                                                        ] === null
                                                            ? 'Pick a score'
                                                            : `Selected score: ${draftScores[choiceIndex]}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                                                {scoreOptions.map((score) => (
                                                    <Button
                                                        aria-label={`Score ${choice} as ${score}`}
                                                        className="w-full"
                                                        key={score}
                                                        onClick={() => {
                                                            onScoreChange(
                                                                choiceIndex,
                                                                score,
                                                            );
                                                        }}
                                                        type="button"
                                                        variant={
                                                            draftScores[
                                                                choiceIndex
                                                            ] === score
                                                                ? 'default'
                                                                : 'outline'
                                                        }
                                                    >
                                                        {score}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap justify-end gap-3">
                                    <LoadingButton
                                        className="w-full sm:w-auto"
                                        disabled={!canSubmitVote}
                                        loading={registerState.isLoading}
                                        loadingLabel="Submitting vote"
                                        size="lg"
                                        type="submit"
                                    >
                                        Submit vote
                                    </LoadingButton>
                                </div>
                            </form>
                        ) : poll.phase === 'open' ? (
                            <div className="space-y-4">
                                <div className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4">
                                    <div className="text-base font-semibold">
                                        Vote stored on this device
                                    </div>
                                    <p className={`${mutedBodyClassName} mt-2`}>
                                        {workflow.currentStep ===
                                        'creator-can-close'
                                            ? 'Your vote is in. You can close voting when you are ready to freeze the submitted roster.'
                                            : 'Your plaintext scores stay on this device until voting closes. You can leave now and come back later.'}
                                    </p>
                                </div>

                                {workflow.currentStep ===
                                'creator-must-submit-first' ? (
                                    <Alert announcement="polite" variant="info">
                                        <AlertDescription>
                                            The creator must submit a vote from
                                            this browser before close becomes
                                            available.
                                        </AlertDescription>
                                    </Alert>
                                ) : null}

                                {workflow.canCloseVoting ? (
                                    <div className="flex flex-wrap justify-end gap-3">
                                        <LoadingButton
                                            className="w-full sm:w-auto"
                                            disabled={!workflow.canCloseVoting}
                                            loading={closeState.isLoading}
                                            loadingLabel="Closing voting"
                                            onClick={() => {
                                                void onCloseVoting();
                                            }}
                                            size="lg"
                                        >
                                            Close voting
                                        </LoadingButton>
                                    </div>
                                ) : isCreatorParticipant ? (
                                    <p className={mutedBodyClassName}>
                                        {poll.submittedParticipantCount <
                                        poll.minimumCloseParticipantCount
                                            ? `At least ${poll.minimumCloseParticipantCount} submitted participants are required before closing.`
                                            : 'Waiting for you to close the submitted roster.'}
                                    </p>
                                ) : null}
                            </div>
                        ) : workflow.canRetryAutomation ? (
                            <div className="flex flex-wrap justify-end gap-3">
                                <Button
                                    className="w-full sm:w-auto"
                                    onClick={() => {
                                        setAutomationError(null);
                                        setAutomaticResolutionAttempt(
                                            (currentAttempt) =>
                                                currentAttempt + 1,
                                        );
                                    }}
                                    size="lg"
                                    variant="outline"
                                >
                                    Retry ceremony
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4">
                                {isResolvingAutomaticAction ||
                                activeActionSlotKey ? (
                                    <Spinner className="size-5" label={null} />
                                ) : null}
                                <p className="text-sm text-secondary">
                                    {nextStepExplanation}
                                </p>
                            </div>
                        )}
                    </Panel>

                    {poll.verification.status === 'verified' ? (
                        <Panel className="space-y-4">
                            <div className="space-y-2">
                                <h2 className="text-xl font-semibold">
                                    Results
                                </h2>
                                <p className={mutedBodyClassName}>
                                    Arithmetic means are shown in the same 1.0
                                    to 10.0 range that each participant used.
                                </p>
                            </div>
                            <div className="grid gap-3">
                                {poll.verification.verifiedOptionTallies.map(
                                    (result) => (
                                        <div
                                            className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4"
                                            key={result.optionIndex}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-foreground">
                                                        {
                                                            poll.choices[
                                                                result.optionIndex -
                                                                    1
                                                            ]
                                                        }
                                                    </div>
                                                    <div className="text-sm text-secondary">
                                                        {
                                                            result.acceptedBallotCount
                                                        }{' '}
                                                        accepted ballots
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-semibold">
                                                        {result.mean.toFixed(2)}
                                                    </div>
                                                    <div className="text-sm text-secondary">
                                                        Tally {result.tally}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </Panel>
                    ) : null}
                </div>

                <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                    <Panel className="space-y-4">
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">
                                Audit and verification
                            </h2>
                            <p className={mutedBodyClassName}>
                                The main flow hides the cryptography. This rail
                                shows what the board currently proves.
                            </p>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div>
                                <div className="font-medium text-foreground">
                                    Verification
                                </div>
                                <div className="text-secondary">
                                    {poll.verification.status === 'verified'
                                        ? 'Verified from the public board log.'
                                        : (poll.verification.reason ??
                                          'Waiting for enough public data to verify the full ceremony.')}
                                </div>
                            </div>
                            <div>
                                <div className="font-medium text-foreground">
                                    Reconstruction threshold
                                </div>
                                <div className="text-secondary">
                                    {poll.thresholds.reconstructionThreshold ??
                                        'Pending close'}
                                </div>
                            </div>
                            <div>
                                <div className="font-medium text-foreground">
                                    Minimum published voter count
                                </div>
                                <div className="text-secondary">
                                    {poll.thresholds
                                        .minimumPublishedVoterCount ??
                                        'Pending close'}
                                </div>
                            </div>
                            {poll.sessionFingerprint ? (
                                <div>
                                    <div className="font-medium text-foreground">
                                        Session fingerprint
                                    </div>
                                    <div className="text-secondary break-all">
                                        {poll.sessionFingerprint}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Panel>

                    <Panel className="space-y-4">
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">
                                Ceremony progress
                            </h2>
                            <p className={mutedBodyClassName}>
                                Counts are derived from the accepted board log.
                            </p>
                        </div>

                        <div className="grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Submitted participants
                                </span>
                                <span>{poll.submittedParticipantCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Active ceremony roster
                                </span>
                                <span>
                                    {poll.ceremony.activeParticipantCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Board registrations
                                </span>
                                <span>
                                    {acceptedRegistrations}/
                                    {poll.ceremony.activeParticipantCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Manifest acceptances
                                </span>
                                <span>
                                    {acceptedManifestAcceptances}/
                                    {poll.ceremony.activeParticipantCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Key confirmations
                                </span>
                                <span>
                                    {acceptedKeyConfirmations}/
                                    {poll.ceremony.activeParticipantCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Complete encrypted ballots
                                </span>
                                <span>
                                    {
                                        poll.ceremony
                                            .completeEncryptedBallotParticipantCount
                                    }
                                    /{poll.ceremony.activeParticipantCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Decryption shares
                                </span>
                                <span>
                                    {poll.ceremony.acceptedDecryptionShareCount}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Reveal status
                                </span>
                                <span>{formatRevealStatus(poll)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Ceremony restarts
                                </span>
                                <span>{poll.ceremony.restartCount}</span>
                            </div>
                        </div>
                    </Panel>

                    <Panel className="space-y-4">
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">
                                Participants
                            </h2>
                            <p className={mutedBodyClassName}>
                                The pre-close roster is public and auditable.
                            </p>
                        </div>

                        <ul
                            aria-label="Participants roster"
                            className="space-y-2"
                        >
                            {poll.voters.map((participant) => (
                                <li
                                    className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3 text-sm"
                                    key={participant.voterIndex}
                                >
                                    <div className="font-medium text-foreground">
                                        {participant.voterIndex}.{' '}
                                        {participant.voterName}
                                    </div>
                                    <div className="text-secondary">
                                        {participant.deviceReady
                                            ? 'Device keys submitted'
                                            : 'Device keys pending'}
                                        {participant.ceremonyState ===
                                        'blocking'
                                            ? ' | currently blocking the active ceremony'
                                            : participant.ceremonyState ===
                                                'skipped'
                                              ? ' | skipped from the active ceremony'
                                              : ''}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    <Panel className="space-y-4">
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">
                                Board activity
                            </h2>
                            <p className={mutedBodyClassName}>
                                Digests and message counts come from the
                                accepted bulletin board log.
                            </p>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">Accepted</span>
                                <span>{poll.boardAudit.acceptedCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Duplicates
                                </span>
                                <span>{poll.boardAudit.duplicateCount}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Equivocations
                                </span>
                                <span>{poll.boardAudit.equivocationCount}</span>
                            </div>
                            {poll.boardAudit.ceremonyDigest ? (
                                <div>
                                    <div className="font-medium text-foreground">
                                        Ceremony digest
                                    </div>
                                    <div className="text-secondary break-all">
                                        {poll.boardAudit.ceremonyDigest}
                                    </div>
                                </div>
                            ) : null}
                            {poll.boardAudit.phaseDigests.length ? (
                                <div className="space-y-2">
                                    <div className="font-medium text-foreground">
                                        Phase digests
                                    </div>
                                    <ul className="space-y-2">
                                        {poll.boardAudit.phaseDigests.map(
                                            (digest) => (
                                                <li
                                                    className="rounded-[var(--radius-md)] border border-border/70 bg-background px-3 py-3"
                                                    key={`${digest.phase}-${digest.digest}`}
                                                >
                                                    <div className="font-medium text-foreground">
                                                        Phase {digest.phase}
                                                    </div>
                                                    <div className="text-secondary break-all">
                                                        {digest.digest}
                                                    </div>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </div>
                            ) : null}
                            {poll.boardEntries.length ? (
                                <div className="space-y-2">
                                    <div className="font-medium text-foreground">
                                        Latest entries
                                    </div>
                                    <div className="space-y-2">
                                        {poll.boardEntries
                                            .slice(-8)
                                            .reverse()
                                            .map((entry) => (
                                                <div
                                                    className="rounded-[var(--radius-md)] border border-border/70 bg-background px-3 py-3 text-sm"
                                                    key={entry.id}
                                                >
                                                    <div className="font-medium text-foreground">
                                                        {formatBoardEntryTitle(
                                                            entry,
                                                            poll,
                                                        )}
                                                    </div>
                                                    <div className="text-secondary">
                                                        {formatBoardEntryStatus(
                                                            entry,
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Panel>
                </div>
            </div>

            {(isLoading || isFetching) && (
                <div aria-live="polite" className="sr-only">
                    Refreshing vote state
                </div>
            )}
        </section>
    );
};

export default PollPage;
