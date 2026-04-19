import React from 'react';
import { useParams } from 'react-router-dom';
import { fixedScoreRange } from '@sealed-vote/contracts';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import LoadingButton from 'components/LoadingButton/LoadingButton';
import NotFound from 'components/NotFound/NotFound';
import {
    createEmptyRecoverableAutomaticActionRetryState,
    getRecoverableAutomaticActionRetryDecision,
    getLocalCeremonyState,
    isRecoverableAutomaticActionSubmissionError,
    isPreparedAutomaticActionCurrent,
} from 'features/polls/PollPage/automatic-action-state';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    saveVoterSession,
} from 'features/polls/poll-session-storage';
import { generateClientToken } from 'features/polls/client-token';
import {
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
    type PreparedCeremonyAction,
} from 'features/polls/poll-board-actions';
import {
    clearStoredBallotScores,
    createPendingPollDeviceState,
    createPollDeviceState,
    findPollDeviceStateByPollId,
    findPollDeviceStateByPollSlug,
    savePollDeviceState,
} from 'features/polls/poll-device-storage';
import { derivePollWorkflow } from 'features/polls/poll-workflow';
import {
    useCloseVotingMutation,
    useFetchPollQuery,
    useLazyFetchPollQuery,
    usePostBoardMessageMutation,
    useRegisterVoterMutation,
    useRestartCeremonyMutation,
} from 'features/polls/polls-api';
import { renderError } from 'utils/network-errors';

const minimumScore = fixedScoreRange.min;
const maximumScore = fixedScoreRange.max;
const automaticActionRecoverableRetryLimit = 2;
const automaticActionRecoverableRetryError =
    'Automatic ceremony progress is still out of sync with the active board state. Retry ceremony from this browser to try again.';
const boardConfirmationDelayMs = 250;
const boardConfirmationMaxAttempts = 6;
const steadyStatePollingIntervalMs = 5_000;
const activeCeremonyPollingIntervalMs = 1_000;
const scoreOptions = Array.from(
    { length: maximumScore - minimumScore + 1 },
    (_value, offset) => minimumScore + offset,
);

type PollData = NonNullable<ReturnType<typeof useFetchPollQuery>['data']>;
type PollBoardEntry = PollData['boardEntries'][number];
const activeCeremonyPhases = new Set<PollData['phase']>([
    'ready-to-reveal',
    'revealing',
    'securing',
]);

const isSamePreparedAction = (
    left: PreparedCeremonyAction | null,
    right: PreparedCeremonyAction,
): boolean =>
    !!left &&
    left.kind === right.kind &&
    left.slotKey === right.slotKey &&
    left.signedPayload.signature === right.signedPayload.signature;

const findBoardEntryForPreparedAction = ({
    action,
    poll,
}: {
    action: PreparedCeremonyAction | null;
    poll: PollData | undefined;
}): PollBoardEntry | null => {
    if (!action || !poll) {
        return null;
    }

    return (
        poll.boardEntries.find(
            (entry: PollBoardEntry) =>
                entry.slotKey === action.slotKey &&
                entry.signedPayload.signature ===
                    action.signedPayload.signature,
        ) ?? null
    );
};

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

const getPollRefreshInterval = (
    poll: Pick<PollData, 'phase'> | null | undefined,
): number =>
    poll && activeCeremonyPhases.has(poll.phase)
        ? activeCeremonyPollingIntervalMs
        : steadyStatePollingIntervalMs;

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
        return `${baseTitle} for voter ${payload.recipientIndex}`;
    }

    if (Array.isArray(payload.countedParticipantIndices)) {
        return `${baseTitle} counting ${payload.countedParticipantIndices.length} participants`;
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

const isPollVoterLocal = ({
    devicePollId,
    pollId,
    voterPollId,
}: {
    devicePollId: string | null | undefined;
    pollId: string;
    voterPollId: string | null | undefined;
}): boolean => devicePollId === pollId && voterPollId === pollId;

const buildSubmittedVoterSummary = ({
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
    const [fetchLatestPoll] = useLazyFetchPollQuery();
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
    const [
        awaitingBoardConfirmationAction,
        setAwaitingBoardConfirmationAction,
    ] = React.useState<PreparedCeremonyAction | null>(null);
    const [isResolvingAutomaticAction, setIsResolvingAutomaticAction] =
        React.useState(false);
    const [automaticResolutionAttempt, setAutomaticResolutionAttempt] =
        React.useState(0);
    const [
        recoverableAutomaticActionRetryState,
        setRecoverableAutomaticActionRetryState,
    ] = React.useState(() => createEmptyRecoverableAutomaticActionRetryState());
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
    } = useFetchPollQuery(pollSlug, {
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

    const localCeremonyState = React.useMemo(
        () =>
            getLocalCeremonyState({
                poll,
                voterSession,
            }),
        [poll, voterSession],
    );

    const currentAutomaticAction = React.useMemo(
        () =>
            isPreparedAutomaticActionCurrent({
                action: automaticAction,
                deviceState,
                poll,
                voterSession,
            })
                ? automaticAction
                : null,
        [automaticAction, deviceState, poll, voterSession],
    );

    const currentAutomaticActionDescription =
        currentAutomaticAction !== null ? automaticActionDescription : null;

    React.useEffect(() => {
        if (!awaitingBoardConfirmationAction) {
            return;
        }

        if (
            poll?.phase === 'aborted' ||
            poll?.phase === 'complete' ||
            !isPreparedAutomaticActionCurrent({
                action: awaitingBoardConfirmationAction,
                deviceState,
                poll,
                voterSession,
            }) ||
            findBoardEntryForPreparedAction({
                action: awaitingBoardConfirmationAction,
                poll,
            }) !== null
        ) {
            setAwaitingBoardConfirmationAction(null);
        }
    }, [awaitingBoardConfirmationAction, deviceState, poll, voterSession]);

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

            if (
                automaticAction !== null &&
                !isPreparedAutomaticActionCurrent({
                    action: automaticAction,
                    deviceState,
                    poll,
                    voterSession,
                })
            ) {
                setAutomaticAction(null);
                setAutomaticActionDescription(null);
            }

            if (activeActionSlotKey) {
                return;
            }

            if (
                isPreparedAutomaticActionCurrent({
                    action: awaitingBoardConfirmationAction,
                    deviceState,
                    poll,
                    voterSession,
                }) &&
                findBoardEntryForPreparedAction({
                    action: awaitingBoardConfirmationAction,
                    poll,
                }) === null
            ) {
                setAutomaticAction(awaitingBoardConfirmationAction);
                setAutomaticActionDescription(
                    describeAutomaticCeremonyAction(
                        awaitingBoardConfirmationAction,
                    ),
                );
                setAutomationError(null);
                setIsResolvingAutomaticAction(false);
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
        automaticAction,
        automaticResolutionAttempt,
        awaitingBoardConfirmationAction,
        creatorSession,
        deviceState,
        localCeremonyState,
        poll,
        voterSession,
    ]);

    React.useEffect(() => {
        if (!poll || !deviceState) {
            return;
        }

        if (
            deviceState.storedBallotScores !== null &&
            (poll.phase === 'complete' ||
                poll.phase === 'aborted' ||
                localCeremonyState === 'skipped')
        ) {
            clearStoredBallotScores(poll.id);
        }
    }, [deviceState, localCeremonyState, poll]);

    const submitPreparedAction = React.useCallback(
        async (action: PreparedCeremonyAction): Promise<void> => {
            if (
                !poll ||
                !deviceState ||
                !voterSession ||
                closeState.isLoading ||
                restartState.isLoading ||
                !isPreparedAutomaticActionCurrent({
                    action,
                    deviceState,
                    poll,
                    voterSession,
                })
            ) {
                return;
            }

            setLocalError(null);
            setLocalNotice(null);
            setAutomationError(null);
            setAutomaticAction(null);
            setAutomaticActionDescription(null);
            setActiveActionSlotKey(action.slotKey);

            let actionToSubmit: PreparedCeremonyAction | null = null;

            try {
                const latestPoll = await fetchLatestPoll(poll.slug).unwrap();
                const latestDeviceState =
                    findPollDeviceStateByPollId(latestPoll.id) ??
                    findPollDeviceStateByPollSlug(latestPoll.slug);
                const latestVoterSession =
                    findVoterSessionByPollId(latestPoll.id) ??
                    findVoterSessionByPollSlug(latestPoll.slug);

                if (
                    !latestDeviceState ||
                    !latestVoterSession ||
                    !isPreparedAutomaticActionCurrent({
                        action,
                        deviceState: latestDeviceState,
                        poll: latestPoll,
                        voterSession: latestVoterSession,
                    })
                ) {
                    await refetch();
                    return;
                }

                const latestAction = await resolveAutomaticCeremonyAction({
                    creatorSession:
                        findCreatorSessionByPollId(latestPoll.id) ??
                        findCreatorSessionByPollSlug(latestPoll.slug),
                    deviceState: latestDeviceState,
                    poll: latestPoll,
                    voterSession: latestVoterSession,
                });

                if (!latestAction) {
                    await refetch();
                    return;
                }

                const submissionPoll = await fetchLatestPoll(
                    poll.slug,
                ).unwrap();
                const submissionDeviceState =
                    findPollDeviceStateByPollId(submissionPoll.id) ??
                    findPollDeviceStateByPollSlug(submissionPoll.slug);
                const submissionVoterSession =
                    findVoterSessionByPollId(submissionPoll.id) ??
                    findVoterSessionByPollSlug(submissionPoll.slug);

                if (
                    !submissionDeviceState ||
                    !submissionVoterSession ||
                    !isPreparedAutomaticActionCurrent({
                        action: latestAction,
                        deviceState: submissionDeviceState,
                        poll: submissionPoll,
                        voterSession: submissionVoterSession,
                    })
                ) {
                    await refetch();
                    return;
                }

                actionToSubmit = latestAction;

                if (actionToSubmit.slotKey !== action.slotKey) {
                    setActiveActionSlotKey(actionToSubmit.slotKey);
                }

                await postBoardMessage({
                    pollId: submissionPoll.id,
                    boardMessage: {
                        signedPayload: actionToSubmit.signedPayload,
                        voterToken: submissionVoterSession.voterToken,
                    },
                }).unwrap();
                setRecoverableAutomaticActionRetryState(
                    createEmptyRecoverableAutomaticActionRetryState(),
                );
                setAwaitingBoardConfirmationAction(actionToSubmit);

                // Keep the saved payload until poll state confirms the slot was
                // accepted. Clearing it here can regenerate a fresh randomized
                // proof for the same slot while the refetch is still catching up.
                let refreshedPoll = submissionPoll;
                let refreshedDeviceState: typeof submissionDeviceState | null =
                    submissionDeviceState;
                let refreshedVoterSession:
                    | typeof submissionVoterSession
                    | null = submissionVoterSession;
                let refreshedBoardEntry: PollBoardEntry | null = null;
                let actionStillCurrent = true;

                for (
                    let attempt = 0;
                    attempt < boardConfirmationMaxAttempts;
                    attempt += 1
                ) {
                    refreshedPoll = await fetchLatestPoll(poll.slug).unwrap();
                    refreshedDeviceState =
                        findPollDeviceStateByPollId(refreshedPoll.id) ??
                        findPollDeviceStateByPollSlug(refreshedPoll.slug);
                    refreshedVoterSession =
                        findVoterSessionByPollId(refreshedPoll.id) ??
                        findVoterSessionByPollSlug(refreshedPoll.slug);
                    actionStillCurrent =
                        !!refreshedDeviceState && !!refreshedVoterSession
                            ? isPreparedAutomaticActionCurrent({
                                  action: actionToSubmit,
                                  deviceState: refreshedDeviceState,
                                  poll: refreshedPoll,
                                  voterSession: refreshedVoterSession,
                              })
                            : false;
                    refreshedBoardEntry = findBoardEntryForPreparedAction({
                        action: actionToSubmit,
                        poll: refreshedPoll,
                    });

                    if (
                        refreshedBoardEntry ||
                        refreshedPoll.phase === 'aborted' ||
                        refreshedPoll.phase === 'complete' ||
                        !actionStillCurrent
                    ) {
                        break;
                    }

                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, boardConfirmationDelayMs);
                    });
                }

                if (
                    refreshedBoardEntry ||
                    refreshedPoll.phase === 'aborted' ||
                    refreshedPoll.phase === 'complete' ||
                    !actionStillCurrent
                ) {
                    setAwaitingBoardConfirmationAction(null);
                }

                if (
                    refreshedBoardEntry &&
                    refreshedPoll.phase !== 'aborted' &&
                    refreshedPoll.phase !== 'complete' &&
                    refreshedDeviceState &&
                    refreshedVoterSession
                ) {
                    const nextAction = await resolveAutomaticCeremonyAction({
                        creatorSession:
                            findCreatorSessionByPollId(refreshedPoll.id) ??
                            findCreatorSessionByPollSlug(refreshedPoll.slug),
                        deviceState: refreshedDeviceState,
                        poll: refreshedPoll,
                        voterSession: refreshedVoterSession,
                    });

                    if (
                        nextAction &&
                        !isSamePreparedAction(nextAction, actionToSubmit)
                    ) {
                        await submitPreparedAction(nextAction);
                        return;
                    }
                }
            } catch (submissionError) {
                if (
                    isRecoverableAutomaticActionSubmissionError(submissionError)
                ) {
                    if (!actionToSubmit) {
                        setAutomationError(renderError(submissionError));
                        return;
                    }

                    const retryDecision =
                        getRecoverableAutomaticActionRetryDecision({
                            action: actionToSubmit,
                            maxAutomaticRetries:
                                automaticActionRecoverableRetryLimit,
                            previousState: recoverableAutomaticActionRetryState,
                        });

                    setRecoverableAutomaticActionRetryState(
                        retryDecision.nextState,
                    );
                    setAwaitingBoardConfirmationAction(null);
                    setAutomaticAction(null);
                    setAutomaticActionDescription(null);
                    if (!retryDecision.shouldRetryAutomatically) {
                        setAutomationError(
                            automaticActionRecoverableRetryError,
                        );
                        return;
                    }

                    setAutomationError(null);
                    await refetch();
                    setAutomaticResolutionAttempt((attempt) => attempt + 1);
                    return;
                }

                setAutomationError(renderError(submissionError));
            } finally {
                setActiveActionSlotKey(null);
            }
        },
        [
            closeState.isLoading,
            deviceState,
            fetchLatestPoll,
            poll,
            postBoardMessage,
            refetch,
            recoverableAutomaticActionRetryState,
            restartState.isLoading,
            voterSession,
        ],
    );

    React.useEffect(() => {
        if (
            !poll ||
            localCeremonyState === 'skipped' ||
            (poll.phase !== 'securing' &&
                poll.phase !== 'ready-to-reveal' &&
                poll.phase !== 'revealing') ||
            !currentAutomaticAction ||
            closeState.isLoading ||
            restartState.isLoading ||
            isSamePreparedAction(
                awaitingBoardConfirmationAction,
                currentAutomaticAction,
            ) ||
            !!activeActionSlotKey ||
            !!automationError
        ) {
            return;
        }

        void submitPreparedAction(currentAutomaticAction);
    }, [
        activeActionSlotKey,
        awaitingBoardConfirmationAction,
        automationError,
        closeState.isLoading,
        currentAutomaticAction,
        localCeremonyState,
        poll,
        restartState.isLoading,
        submitPreparedAction,
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

    const submittedVoterSummary = buildSubmittedVoterSummary({
        count: poll.submittedVoterCount,
        minimum: poll.minimumCloseVoterCount,
    });
    const shareUrl =
        typeof window === 'undefined'
            ? `https://sealed.vote/polls/${poll.slug}`
            : window.location.href;
    const localVoter = isPollVoterLocal({
        devicePollId: deviceState?.pollId,
        pollId: poll.id,
        voterPollId: voterSession?.pollId,
    });
    const workflow = derivePollWorkflow({
        creatorSessionPollId: creatorSession?.pollId ?? null,
        deviceState,
        hasAutomaticCeremonyAction: currentAutomaticAction !== null,
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
    const blockingVoters = poll.voters.filter((participant) =>
        poll.ceremony.blockingVoterIndices.includes(participant.voterIndex),
    );
    const canRestartCeremony =
        poll.phase === 'securing' &&
        poll.ceremony.activeParticipantCount - blockingVoters.length >=
            poll.minimumCloseVoterCount;

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
            blockingVoters.length === 0 ||
            !canRestartCeremony
        ) {
            return;
        }

        const blockingVoterNames = blockingVoters
            .map((voter) => voter.voterName)
            .join(', ');
        const confirmed =
            typeof window === 'undefined' ||
            window.confirm(
                `Restart the ceremony without ${blockingVoterNames}? Their locally stored votes will not be counted for this closed vote.`,
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
                `Restarted the ceremony without ${blockingVoterNames}. Those votes will not be counted unless those voters had already finished the active ceremony session before the restart.`,
            );
            await refetch();
        } catch (restartError) {
            setLocalError(renderError(restartError));
        }
    };

    const primaryExplanation =
        workflow.currentStep === 'anonymous-ready-to-vote'
            ? 'Score every option from 1 to 10, submit once, and come back after the creator closes voting.'
            : workflow.currentStep === 'submitting-vote'
              ? 'Saving your final local vote and registering this device for the later ceremony.'
              : workflow.currentStep === 'creator-must-submit-first'
                ? 'You still need to submit your own vote from this browser before you can close voting.'
                : workflow.currentStep === 'vote-stored-waiting-for-close'
                  ? 'Your plaintext scores are stored only on this device until the creator closes voting.'
                  : workflow.currentStep === 'creator-can-close'
                    ? 'Everyone who submitted before you close will be included. Everyone else stays out.'
                    : workflow.currentStep === 'securing-auto'
                      ? (currentAutomaticActionDescription ??
                        'Securing the election in the background.')
                      : workflow.currentStep === 'automation-retry-required'
                        ? (automationError ??
                          'Automatic ceremony progress needs a retry from this browser.')
                        : workflow.currentStep === 'securing-waiting'
                          ? 'Waiting for the rest of the group to finish the secure setup and encrypted ballot publication.'
                          : workflow.currentStep === 'skipped'
                            ? 'The creator restarted the ceremony without this voter. Your locally stored vote was not counted for this closed vote.'
                            : workflow.currentStep === 'revealing-auto'
                              ? (currentAutomaticActionDescription ??
                                'Starting the reveal and publishing decryption material in the background.')
                              : workflow.currentStep === 'revealing-waiting'
                                ? 'Waiting for threshold decryption shares and final tally publication.'
                                : workflow.currentStep === 'waiting-for-results'
                                  ? 'The ceremony is moving without any action needed from this browser.'
                                  : workflow.currentStep ===
                                      'local-vote-missing'
                                    ? 'This browser no longer has the local vote and device state required to continue in this vote.'
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
                                <h1 className="page-title">{poll.pollName}</h1>
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
                                        Submitted voters
                                    </div>
                                    <div>{submittedVoterSummary}</div>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div className="space-y-2">
                                <div className="text-sm font-medium text-foreground">
                                    Shareable poll link
                                </div>
                                <div className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3 text-sm break-all">
                                    {shareUrl}
                                </div>
                                <p
                                    aria-live="polite"
                                    className="field-note min-h-6"
                                >
                                    {copyNotice}
                                </p>
                            </div>
                            <Button
                                data-testid="copy-link-button"
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
                            <p className="field-note">{nextStepExplanation}</p>
                        </div>

                        {creatorSession?.pollId === poll.id &&
                        poll.phase === 'securing' &&
                        blockingVoters.length > 0 ? (
                            <Alert announcement="polite" variant="info">
                                <AlertDescription>
                                    <div className="space-y-3">
                                        <p>
                                            Ceremony progress is waiting on{' '}
                                            {blockingVoters
                                                .map((voter) => voter.voterName)
                                                .join(', ')}
                                            . If you restart the ceremony
                                            without them, any votes that those
                                            voters have not already advanced
                                            through the active ceremony session
                                            will be skipped for this closed
                                            vote.
                                        </p>
                                        {!canRestartCeremony ? (
                                            <p className="text-sm text-secondary">
                                                You can restart the ceremony
                                                only when removing the current
                                                blocking voters would still
                                                leave at least{' '}
                                                {poll.minimumCloseVoterCount}{' '}
                                                active voters in the ceremony.
                                            </p>
                                        ) : null}
                                        {canRestartCeremony ? (
                                            <div className="flex flex-wrap justify-end gap-3">
                                                <LoadingButton
                                                    className="w-full sm:w-auto"
                                                    loading={
                                                        restartState.isLoading
                                                    }
                                                    loadingLabel="Restarting ceremony"
                                                    onClick={() => {
                                                        void onRestartCeremony();
                                                    }}
                                                    size="lg"
                                                    variant="outline"
                                                >
                                                    Restart ceremony without
                                                    blocking voters
                                                </LoadingButton>
                                            </div>
                                        ) : null}
                                    </div>
                                </AlertDescription>
                            </Alert>
                        ) : null}

                        {poll.phase === 'open' && !localVoter ? (
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
                                        <p className="field-note">
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
                        ) : poll.phase === 'open' &&
                          workflow.currentStep !== 'local-vote-missing' ? (
                            <div className="space-y-4">
                                <div className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4">
                                    <div className="text-base font-semibold">
                                        Vote stored on this device
                                    </div>
                                    <p className="field-note mt-2">
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
                                    <p className="field-note">
                                        {poll.submittedVoterCount <
                                        poll.minimumCloseVoterCount
                                            ? `At least ${poll.minimumCloseVoterCount} submitted voters are required before closing.`
                                            : 'Waiting for you to close the submitted roster.'}
                                    </p>
                                ) : null}
                            </div>
                        ) : workflow.canRetryAutomation ? (
                            <div className="flex flex-wrap justify-end gap-3">
                                <Button
                                    className="w-full sm:w-auto"
                                    onClick={() => {
                                        setRecoverableAutomaticActionRetryState(
                                            createEmptyRecoverableAutomaticActionRetryState(),
                                        );
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
                        <Panel
                            className="space-y-4"
                            data-testid="verified-results-panel"
                        >
                            <div className="space-y-2">
                                <h2 className="text-xl font-semibold">
                                    Results
                                </h2>
                                <p className="field-note">
                                    Arithmetic means are shown in the same 1.0
                                    to 10.0 range that each voter used.
                                </p>
                            </div>
                            <div className="grid gap-3">
                                {poll.verification.verifiedOptionTallies.map(
                                    (result) => (
                                        <div
                                            className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-4"
                                            data-testid="verified-result-card"
                                            key={result.optionIndex}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                                <div className="space-y-1">
                                                    <div
                                                        className="text-sm font-medium text-foreground"
                                                        data-testid="verified-result-choice"
                                                    >
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
                            <p className="field-note">
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
                            <p className="field-note">
                                Counts are derived from the accepted board log.
                            </p>
                        </div>

                        <div className="grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-secondary">
                                    Submitted voters
                                </span>
                                <span>{poll.submittedVoterCount}</span>
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
                            <h2 className="text-xl font-semibold">Voters</h2>
                            <p className="field-note">
                                The pre-close roster is public and auditable.
                            </p>
                        </div>

                        <ul aria-label="Voters roster" className="space-y-2">
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
                            <p className="field-note">
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
                    Refreshing poll state
                </div>
            )}
        </section>
    );
};

export default PollPage;
