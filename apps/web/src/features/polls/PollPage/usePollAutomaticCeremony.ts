import React from 'react';

import {
    createEmptyRecoverableAutomaticActionRetryState,
    getRecoverableAutomaticActionRetryDecision,
    isPreparedAutomaticActionCurrent,
    isRecoverableAutomaticActionSubmissionError,
} from './automatic-action-state';
import {
    findBoardEntryForPreparedAction,
    isSamePreparedAction,
} from './poll-page-helpers';
import type { PollBoardEntry, PollData } from './poll-page-types';

import {
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
    type PreparedCeremonyAction,
} from 'features/polls/poll-board-actions';
import {
    findPollDeviceStateByPollId,
    findPollDeviceStateByPollSlug,
    type StoredPollDeviceState,
} from 'features/polls/poll-device-storage';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    type StoredCreatorSession,
    type StoredVoterSession,
} from 'features/polls/poll-session-storage';
import {
    useLazyFetchPollQuery,
    usePostBoardMessageMutation,
} from 'features/polls/polls-api';
import { renderError } from 'utils/network-errors';

const automaticActionRecoverableRetryLimit = 2;
const automaticActionRecoverableRetryError =
    'Automatic ceremony progress is still out of sync with the active board state. Retry ceremony from this browser to try again.';
const boardConfirmationDelayMs = 250;
const boardConfirmationMaxAttempts = 6;

export const usePollAutomaticCeremony = ({
    creatorSession,
    deviceState,
    isClosingVoting,
    isRestartingCeremony,
    localCeremonyState,
    poll,
    refetchPoll,
    setLocalError,
    setLocalNotice,
    voterSession,
}: {
    creatorSession: StoredCreatorSession | null;
    deviceState: StoredPollDeviceState | null;
    isClosingVoting: boolean;
    isRestartingCeremony: boolean;
    localCeremonyState: PollData['voters'][number]['ceremonyState'] | null;
    poll: PollData | undefined;
    refetchPoll: () => Promise<unknown>;
    setLocalError: (message: string | null) => void;
    setLocalNotice: (message: string | null) => void;
    voterSession: StoredVoterSession | null;
}): {
    activeActionSlotKey: string | null;
    automationError: string | null;
    currentAutomaticActionDescription: string | null;
    hasAutomaticCeremonyAction: boolean;
    isResolvingAutomaticAction: boolean;
    retryAutomaticCeremony: () => void;
} => {
    const [fetchLatestPoll] = useLazyFetchPollQuery();
    const [postBoardMessage] = usePostBoardMessageMutation();
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

    const submitPreparedAction = React.useCallback(
        async (action: PreparedCeremonyAction): Promise<void> => {
            if (
                !poll ||
                !deviceState ||
                !voterSession ||
                isClosingVoting ||
                isRestartingCeremony ||
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
                    await refetchPoll();
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
                    await refetchPoll();
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
                    await refetchPoll();
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
                    await refetchPoll();
                    setAutomaticResolutionAttempt((attempt) => attempt + 1);
                    return;
                }

                setAutomationError(renderError(submissionError));
            } finally {
                setActiveActionSlotKey(null);
            }
        },
        [
            deviceState,
            fetchLatestPoll,
            isClosingVoting,
            isRestartingCeremony,
            poll,
            postBoardMessage,
            refetchPoll,
            recoverableAutomaticActionRetryState,
            setLocalError,
            setLocalNotice,
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
            isClosingVoting ||
            isRestartingCeremony ||
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
        currentAutomaticAction,
        isClosingVoting,
        isRestartingCeremony,
        localCeremonyState,
        poll,
        submitPreparedAction,
    ]);

    const retryAutomaticCeremony = React.useCallback((): void => {
        setRecoverableAutomaticActionRetryState(
            createEmptyRecoverableAutomaticActionRetryState(),
        );
        setAutomationError(null);
        setAutomaticResolutionAttempt((currentAttempt) => currentAttempt + 1);
    }, []);

    return {
        activeActionSlotKey,
        automationError,
        currentAutomaticActionDescription,
        hasAutomaticCeremonyAction: currentAutomaticAction !== null,
        isResolvingAutomaticAction,
        retryAutomaticCeremony,
    };
};
