import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import {
    mutedBodyClassName,
    pageTitleClassName,
    sectionTitleClassName,
} from '@/lib/uiClasses';
import NotFound from 'components/NotFound/NotFound';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
} from 'features/Polls/creatorSessionStorage';
import { generateClientToken } from 'features/Polls/clientToken';
import {
    createPendingPollDeviceState,
    createPollDeviceState,
    findPollDeviceStateByPollId,
    findPollDeviceStateByPollSlug,
    importStoredAuthPrivateKey,
    savePollDeviceState,
} from 'features/Polls/pollDeviceStorage';
import {
    describeAutoBoardSetupAction,
    resolveAutoBoardSetupAction,
    signProtocolPayload,
} from 'features/Polls/pollBoardActions';
import {
    clampThresholdPercent,
    resolveThresholdPercentRange,
    resolveThresholdPreview,
} from 'features/Polls/pollThresholds';
import { derivePollWorkflow } from 'features/Polls/pollWorkflow';
import {
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    saveVoterSession,
} from 'features/Polls/voterSessionStorage';
import {
    useGetPollQuery,
    usePostBoardMessageMutation,
    useRegisterVoterMutation,
    useStartVotingMutation,
} from 'features/Polls/pollsApi';
import { renderError } from 'utils/networkErrors';

const phaseLabel = (phase: string): string =>
    (
        ({
            aborted: 'Ceremony aborted',
            complete: 'Results ready',
            open: 'Waiting room open',
            'opening-results': 'Opening results',
            preparing: 'Preparing devices',
            voting: 'Voting live',
        }) as const
    )[phase] ?? phase;

const boardMessageCount = (
    entries: readonly {
        classification: 'accepted' | 'idempotent' | 'equivocation';
        messageType: string;
    }[],
    messageType: string,
): number =>
    entries.filter(
        (entry) =>
            entry.classification === 'accepted' &&
            entry.messageType === messageType,
    ).length;

const PollPage = (): React.JSX.Element => {
    const { pollSlug } = useParams();
    const [registerVoter, registerState] = useRegisterVoterMutation();
    const [postBoardMessage] = usePostBoardMessageMutation();
    const [startVoting, startState] = useStartVotingMutation();
    const [voterName, setVoterName] = useState('');
    const [thresholdPercent, setThresholdPercent] = useState<number | null>(
        null,
    );
    const [autoSetupStep, setAutoSetupStep] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [localNotice, setLocalNotice] = useState<string | null>(null);
    const voterNameInputId = React.useId();
    const thresholdInputId = React.useId();

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
        pollingInterval: 5_000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });

    const creatorSession = useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findCreatorSessionByPollId(poll.id) ??
            findCreatorSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const voterSession = useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findVoterSessionByPollId(poll.id) ??
            findVoterSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const deviceState = useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findPollDeviceStateByPollId(poll.id) ??
            findPollDeviceStateByPollSlug(poll.slug)
        );
    }, [poll]);

    useEffect(() => {
        if (!poll || poll.phase !== 'open') {
            return;
        }

        const range = resolveThresholdPercentRange(poll.joinedParticipantCount);

        setThresholdPercent((currentValue) =>
            currentValue === null
                ? range.defaultPercent
                : clampThresholdPercent(
                      poll.joinedParticipantCount,
                      currentValue,
                  ),
        );
    }, [poll]);

    const autoBoardSetupAction = useMemo(
        () =>
            poll
                ? resolveAutoBoardSetupAction({
                      deviceState,
                      poll,
                      voterSession,
                  })
                : null,
        [deviceState, poll, voterSession],
    );

    useEffect(() => {
        if (
            !poll ||
            !deviceState ||
            !voterSession ||
            !autoBoardSetupAction ||
            autoSetupStep !== null
        ) {
            return;
        }

        let cancelled = false;

        const syncBoardSetup = async (): Promise<void> => {
            setAutoSetupStep(autoBoardSetupAction.kind);

            try {
                const authPrivateKey = await importStoredAuthPrivateKey(
                    deviceState.authPrivateKeyPkcs8,
                );
                const signedPayload = await signProtocolPayload({
                    authPrivateKey,
                    payload: autoBoardSetupAction.payload,
                });

                await postBoardMessage({
                    pollId: poll.id,
                    boardMessage: {
                        signedPayload,
                        voterToken: voterSession.voterToken,
                    },
                }).unwrap();

                if (!cancelled) {
                    await refetch();
                }
            } catch (submissionError) {
                if (!cancelled) {
                    setLocalError(renderError(submissionError));
                }
            } finally {
                if (!cancelled) {
                    setAutoSetupStep(null);
                }
            }
        };

        void syncBoardSetup();

        return () => {
            cancelled = true;
        };
    }, [
        autoBoardSetupAction,
        autoSetupStep,
        deviceState,
        poll,
        postBoardMessage,
        refetch,
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

    const onRegister = async (
        event: React.FormEvent<HTMLFormElement>,
    ): Promise<void> => {
        event.preventDefault();

        if (!poll) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            const pendingDeviceState = await createPendingPollDeviceState();
            const voterToken = generateClientToken();
            const response = await registerVoter({
                pollId: poll.id,
                voterData: {
                    authPublicKey: pendingDeviceState.authPublicKey,
                    transportPublicKey: pendingDeviceState.transportPublicKey,
                    transportSuite: pendingDeviceState.transportSuite,
                    voterName: voterName.trim(),
                    voterToken,
                },
            }).unwrap();
            const persistedDeviceState = await createPollDeviceState({
                pendingState: pendingDeviceState,
                pollId: poll.id,
                pollSlug: poll.slug,
                voterIndex: response.voterIndex,
                voterName: response.voterName,
                voterToken: response.voterToken,
            });

            savePollDeviceState(persistedDeviceState);
            saveVoterSession({
                pollId: poll.id,
                pollSlug: poll.slug,
                voterIndex: response.voterIndex,
                voterName: response.voterName,
                voterToken: response.voterToken,
            });
            setLocalNotice(
                `Joined as ${response.voterName}. Your participant number is ${response.voterIndex}.`,
            );
            setVoterName('');
            await refetch();
        } catch (submissionError) {
            setLocalError(renderError(submissionError));
        }
    };

    const onStartVoting = async (): Promise<void> => {
        if (!poll || !creatorSession || thresholdPercent === null) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            await startVoting({
                pollId: poll.id,
                startData: {
                    creatorToken: creatorSession.creatorToken,
                    thresholdPercent: clampThresholdPercent(
                        poll.joinedParticipantCount,
                        thresholdPercent,
                    ),
                },
            }).unwrap();
            setLocalNotice('Voting started. The roster is now frozen.');
            await refetch();
        } catch (submissionError) {
            setLocalError(renderError(submissionError));
        }
    };

    if (isLoading && !poll) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Panel className="loading-panel max-w-xl">
                    <Spinner className="size-10" />
                </Panel>
            </div>
        );
    }

    if (!poll) {
        return (
            <Alert announcement="assertive" variant="destructive">
                <AlertDescription>{renderError(error)}</AlertDescription>
            </Alert>
        );
    }

    const workflow = derivePollWorkflow({
        creatorSessionPollId: creatorSession?.pollId ?? null,
        deviceState,
        poll,
        voterSession,
    });
    const thresholdRange = resolveThresholdPercentRange(
        poll.joinedParticipantCount,
    );
    const effectiveThresholdPercent = clampThresholdPercent(
        poll.joinedParticipantCount,
        thresholdPercent ?? thresholdRange.defaultPercent,
    );
    const thresholdPreview = resolveThresholdPreview(
        poll.joinedParticipantCount,
        effectiveThresholdPercent,
    );
    const previewParticipantCount = Math.max(
        poll.joinedParticipantCount,
        poll.minimumStartParticipantCount,
    );
    const maximumSupportedThreshold = previewParticipantCount - 1;
    const autoBoardSetupDescription =
        describeAutoBoardSetupAction(autoBoardSetupAction);
    const shareableUrl =
        typeof window === 'undefined'
            ? `https://sealed.vote/votes/${poll.slug}`
            : window.location.href;
    const acceptedRegistrations = boardMessageCount(
        poll.boardEntries,
        'registration',
    );
    const acceptedManifestAcceptances = boardMessageCount(
        poll.boardEntries,
        'manifest-acceptance',
    );
    const hasManifestPublication =
        boardMessageCount(poll.boardEntries, 'manifest-publication') > 0;
    const acceptedBallots = boardMessageCount(
        poll.boardEntries,
        'ballot-submission',
    );
    const acceptedDecryptionShares = boardMessageCount(
        poll.boardEntries,
        'decryption-share',
    );

    const waitingRoomSummary = poll.isOpen
        ? poll.joinedParticipantCount >= poll.minimumStartParticipantCount
            ? 'The roster can be started at any time.'
            : `Waiting for at least ${poll.minimumStartParticipantCount} joined participants before voting can begin.`
        : 'The roster is now frozen for this ceremony.';

    const nextStepHeading =
        workflow.currentStep === 'anonymous-waiting-to-join'
            ? 'Join this vote'
            : workflow.currentStep === 'joined-and-waiting-for-start'
              ? 'Waiting room'
              : workflow.currentStep === 'preparing-device'
                ? 'Preparing your device'
                : workflow.currentStep === 'ready-to-vote'
                  ? 'Voting is live'
                  : workflow.currentStep === 'vote-submitted-and-waiting'
                    ? 'Vote submitted'
                    : workflow.currentStep === 'ready-to-help-open-results'
                      ? 'Help open results'
                      : workflow.currentStep === 'waiting-for-results'
                        ? 'Waiting for results'
                        : workflow.currentStep === 'complete'
                          ? 'Verified results'
                          : 'Ceremony aborted';

    const nextStepDescription =
        workflow.currentStep === 'anonymous-waiting-to-join'
            ? 'Pick the public name that should appear on the roster. Everyone in the vote can see this list.'
            : workflow.currentStep === 'joined-and-waiting-for-start'
              ? 'You are already on the public roster. The creator can start voting as soon as the group is ready.'
              : workflow.currentStep === 'preparing-device'
                ? workflow.missingLocalState
                    ? 'This browser is missing the local device state needed to continue the private ceremony.'
                    : (autoBoardSetupDescription ??
                      'The vote has started and the private setup transcript is still being prepared.')
                : workflow.currentStep === 'ready-to-vote'
                  ? 'Voting is open. The board transcript is ready for ballot publication.'
                  : workflow.currentStep === 'vote-submitted-and-waiting'
                    ? 'Your ballot is already on the board. You can leave this page and come back later.'
                    : workflow.currentStep === 'ready-to-help-open-results'
                      ? 'Voting is closed. Your device may still be needed to help open the final tally.'
                      : workflow.currentStep === 'waiting-for-results'
                        ? 'Your part is done. Results will appear here once enough valid decryption shares are published.'
                        : workflow.currentStep === 'complete'
                          ? 'The published result has been verified against the full ceremony transcript.'
                          : 'This ceremony ended in an aborted state. The audit rail on the right shows what was recorded.';

    return (
        <section className="mx-auto flex w-full max-w-[88rem] flex-col gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]">
                <div className="min-w-0 space-y-6">
                    <Panel className="space-y-5">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full border border-border/70 bg-accent px-3 py-1 text-xs font-medium tracking-wide text-foreground/90">
                                    {phaseLabel(poll.phase)}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {poll.joinedParticipantCount} joined
                                </span>
                            </div>
                            <h1 className={pageTitleClassName}>
                                {poll.pollName}
                            </h1>
                            <p className={mutedBodyClassName}>
                                Share this link so people can join from their
                                own devices:
                                <span className="mt-2 block break-all font-mono text-xs text-foreground/80 sm:text-sm">
                                    {shareableUrl}
                                </span>
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Panel padding="compact" tone="subtle">
                                <p className="text-sm font-medium">
                                    {poll.isOpen
                                        ? 'Waiting room'
                                        : 'Frozen roster'}
                                </p>
                                <p className="text-2xl font-semibold">
                                    {poll.joinedParticipantCount}
                                </p>
                                <p className={mutedBodyClassName}>
                                    {waitingRoomSummary}
                                </p>
                            </Panel>
                            <Panel padding="compact" tone="subtle">
                                <p className="text-sm font-medium">
                                    Decryption threshold
                                </p>
                                <p className="text-2xl font-semibold">
                                    {poll.thresholds.reconstructionThreshold ??
                                        'Pending'}
                                </p>
                                <p className={mutedBodyClassName}>
                                    {poll.isOpen
                                        ? `${effectiveThresholdPercent}% would currently resolve to ${thresholdPreview} of ${previewParticipantCount} participants.`
                                        : 'The frozen count needed to help open the result.'}
                                </p>
                            </Panel>
                            <Panel padding="compact" tone="subtle">
                                <p className="text-sm font-medium">
                                    Fingerprint
                                </p>
                                <p className="text-sm font-semibold">
                                    {poll.sessionFingerprint ?? 'Pending'}
                                </p>
                                <p className={mutedBodyClassName}>
                                    Compare this if your group wants an extra
                                    check that everyone sees the same ceremony.
                                </p>
                            </Panel>
                        </div>
                    </Panel>

                    {localError && (
                        <Alert announcement="assertive" variant="destructive">
                            <AlertDescription>{localError}</AlertDescription>
                        </Alert>
                    )}
                    {localNotice && (
                        <Alert variant="info">
                            <AlertDescription>{localNotice}</AlertDescription>
                        </Alert>
                    )}
                    {error && (
                        <Alert announcement="assertive" variant="destructive">
                            <AlertDescription>
                                {renderError(error)}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Panel className="space-y-4">
                        <div className="space-y-1">
                            <h2 className={sectionTitleClassName}>
                                Participants
                            </h2>
                            <p className={mutedBodyClassName}>
                                {poll.isOpen
                                    ? 'People appear here as soon as they join from the shared link.'
                                    : 'This is the frozen roster for the current ceremony.'}
                            </p>
                        </div>
                        {poll.voters.length === 0 ? (
                            <p className="empty-state">
                                No one has joined yet.
                            </p>
                        ) : (
                            <ul
                                aria-label="Participants roster"
                                className="space-y-2"
                            >
                                {poll.voters.map((participant) => (
                                    <li
                                        className="rounded-[var(--radius-md)] border border-border/70 bg-card px-3 py-3"
                                        key={participant.voterIndex}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium">
                                                {participant.voterIndex}.{' '}
                                                {participant.voterName}
                                            </span>
                                            <span className="text-sm text-muted-foreground">
                                                {participant.deviceReady
                                                    ? 'Ready'
                                                    : 'Joining'}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <Panel className="space-y-4">
                        <div className="space-y-1">
                            <h2 className={sectionTitleClassName}>
                                Your next step
                            </h2>
                            <p className={mutedBodyClassName}>
                                {nextStepDescription}
                            </p>
                        </div>

                        <Panel borderStyle="dashed" tone="subtle">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-semibold">
                                        {nextStepHeading}
                                    </h3>
                                    <p className={mutedBodyClassName}>
                                        {nextStepDescription}
                                    </p>
                                </div>

                                {workflow.currentStep ===
                                    'anonymous-waiting-to-join' &&
                                    poll.phase === 'open' && (
                                        <form
                                            className="space-y-4"
                                            onSubmit={(event) =>
                                                void onRegister(event)
                                            }
                                        >
                                            <label
                                                className="flex flex-col gap-2"
                                                htmlFor={voterNameInputId}
                                            >
                                                <span className="text-sm font-medium">
                                                    Your public name
                                                </span>
                                                <input
                                                    className="h-11 rounded-[var(--radius-md)] border border-border bg-background px-3 text-base"
                                                    id={voterNameInputId}
                                                    maxLength={32}
                                                    onChange={(event) =>
                                                        setVoterName(
                                                            event.target.value,
                                                        )
                                                    }
                                                    value={voterName}
                                                />
                                            </label>
                                            <Button
                                                disabled={
                                                    registerState.isLoading ||
                                                    !voterName.trim()
                                                }
                                                size="lg"
                                                type="submit"
                                            >
                                                Join vote
                                            </Button>
                                        </form>
                                    )}

                                {workflow.currentStep ===
                                    'joined-and-waiting-for-start' && (
                                    <p className="empty-state">
                                        You are already in the waiting room. You
                                        do not need to keep this page open while
                                        more people join.
                                    </p>
                                )}

                                {workflow.currentStep ===
                                    'vote-submitted-and-waiting' && (
                                    <p className="empty-state">
                                        Your ballot is already published.
                                        Results will unlock once the ceremony
                                        reaches the final opening phase.
                                    </p>
                                )}

                                {workflow.currentStep ===
                                    'waiting-for-results' && (
                                    <p className="empty-state">
                                        Your part is done. This page will update
                                        automatically while the final shares are
                                        collected.
                                    </p>
                                )}

                                {workflow.currentStep === 'complete' && (
                                    <p className="empty-state">
                                        The verified result is available below.
                                    </p>
                                )}

                                {workflow.currentStep === 'aborted' && (
                                    <p className="empty-state">
                                        This ceremony aborted before a verified
                                        result was produced.
                                    </p>
                                )}

                                {workflow.currentStep !==
                                    'anonymous-waiting-to-join' &&
                                    workflow.currentStep !==
                                        'joined-and-waiting-for-start' &&
                                    workflow.currentStep !==
                                        'vote-submitted-and-waiting' &&
                                    workflow.currentStep !==
                                        'waiting-for-results' &&
                                    workflow.currentStep !== 'complete' &&
                                    workflow.currentStep !== 'aborted' && (
                                        <p className="empty-state">
                                            {workflow.missingLocalState
                                                ? 'This browser is missing the local ceremony state needed for later private actions.'
                                                : (autoBoardSetupDescription ??
                                                  'The private ceremony is progressing through the shared board transcript. This screen will keep tracking your next required action.')}
                                        </p>
                                    )}

                                {poll.phase === 'preparing' &&
                                    !workflow.missingLocalState && (
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <Panel
                                                padding="compact"
                                                tone="subtle"
                                            >
                                                <p className="text-sm font-medium">
                                                    Registrations on board
                                                </p>
                                                <p className="text-2xl font-semibold">
                                                    {acceptedRegistrations}/
                                                    {
                                                        poll.joinedParticipantCount
                                                    }
                                                </p>
                                                <p
                                                    className={
                                                        mutedBodyClassName
                                                    }
                                                >
                                                    Each participant signs one
                                                    hidden board registration
                                                    after the roster is frozen.
                                                </p>
                                            </Panel>
                                            <Panel
                                                padding="compact"
                                                tone="subtle"
                                            >
                                                <p className="text-sm font-medium">
                                                    Manifest
                                                </p>
                                                <p className="text-2xl font-semibold">
                                                    {hasManifestPublication
                                                        ? 'Published'
                                                        : 'Pending'}
                                                </p>
                                                <p
                                                    className={
                                                        mutedBodyClassName
                                                    }
                                                >
                                                    One participant anchors the
                                                    frozen manifest before
                                                    everyone confirms it.
                                                </p>
                                            </Panel>
                                            <Panel
                                                padding="compact"
                                                tone="subtle"
                                            >
                                                <p className="text-sm font-medium">
                                                    Confirmations
                                                </p>
                                                <p className="text-2xl font-semibold">
                                                    {
                                                        acceptedManifestAcceptances
                                                    }
                                                    /
                                                    {
                                                        poll.joinedParticipantCount
                                                    }
                                                </p>
                                                <p
                                                    className={
                                                        mutedBodyClassName
                                                    }
                                                >
                                                    Every participant confirms
                                                    the same frozen ceremony
                                                    before private setup
                                                    continues.
                                                </p>
                                            </Panel>
                                        </div>
                                    )}
                            </div>
                        </Panel>

                        {creatorSession && poll.phase === 'open' && (
                            <Panel borderStyle="dashed" tone="subtle">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold">
                                            Creator controls
                                        </h3>
                                        <p className={mutedBodyClassName}>
                                            Starting voting freezes the current
                                            roster and locks the exact
                                            decryption threshold.
                                        </p>
                                    </div>
                                    <label
                                        className="flex flex-col gap-3"
                                        htmlFor={thresholdInputId}
                                    >
                                        <span className="text-sm font-medium">
                                            {effectiveThresholdPercent}% maps to{' '}
                                            {thresholdPreview} of{' '}
                                            {previewParticipantCount}{' '}
                                            participants
                                        </span>
                                        <input
                                            className="w-full accent-white"
                                            id={thresholdInputId}
                                            max={thresholdRange.maxPercent}
                                            min={thresholdRange.minPercent}
                                            onChange={(event) =>
                                                setThresholdPercent(
                                                    Number(event.target.value),
                                                )
                                            }
                                            step={1}
                                            type="range"
                                            value={effectiveThresholdPercent}
                                        />
                                    </label>
                                    <p className={mutedBodyClassName}>
                                        The current beta protocol supports
                                        threshold counts from{' '}
                                        {poll.thresholds.strictMajorityFloor} to{' '}
                                        {maximumSupportedThreshold} for the
                                        current roster size. Full n-of-n is not
                                        supported by the published protocol yet.
                                    </p>
                                    <Button
                                        disabled={
                                            startState.isLoading ||
                                            poll.joinedParticipantCount <
                                                poll.minimumStartParticipantCount
                                        }
                                        onClick={() => void onStartVoting()}
                                        size="lg"
                                    >
                                        Start voting
                                    </Button>
                                </div>
                            </Panel>
                        )}
                    </Panel>

                    {poll.verification.verifiedOptionTallies.length > 0 && (
                        <Panel className="space-y-4">
                            <div className="space-y-1">
                                <h2 className={sectionTitleClassName}>
                                    Results
                                </h2>
                                <p className={mutedBodyClassName}>
                                    Arithmetic means are shown only after the
                                    published tally has been fully verified.
                                </p>
                            </div>
                            <div className="space-y-3">
                                {poll.verification.verifiedOptionTallies.map(
                                    (result) => (
                                        <div
                                            className="rounded-[var(--radius-md)] border border-border/70 bg-card p-4"
                                            key={result.optionIndex}
                                        >
                                            <p className="font-semibold">
                                                {poll.choices[
                                                    result.optionIndex - 1
                                                ] ??
                                                    `Option ${result.optionIndex}`}
                                            </p>
                                            <p className={mutedBodyClassName}>
                                                Mean: {result.mean}
                                            </p>
                                            <p className={mutedBodyClassName}>
                                                Verified tally: {result.tally}
                                            </p>
                                            <p className={mutedBodyClassName}>
                                                Accepted ballots:{' '}
                                                {result.acceptedBallotCount}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </Panel>
                    )}
                </div>
                <aside className="min-w-0 space-y-6">
                    <Panel
                        aria-label="Audit and verification details"
                        className="space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto"
                        tabIndex={0}
                    >
                        <div className="space-y-1">
                            <h2 className={sectionTitleClassName}>
                                Audit and verification
                            </h2>
                            <p className={mutedBodyClassName}>
                                The right rail keeps the technical and
                                cryptographic state visible without getting in
                                the way of the main flow.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className={mutedBodyClassName}>
                                Verification status: {poll.verification.status}
                            </p>
                            {poll.verification.reason && (
                                <p className={mutedBodyClassName}>
                                    {poll.verification.reason}
                                </p>
                            )}
                            <p className={mutedBodyClassName}>
                                Accepted board messages:{' '}
                                {poll.boardAudit.acceptedCount}
                            </p>
                            <p className={mutedBodyClassName}>
                                Idempotent retransmissions:{' '}
                                {poll.boardAudit.duplicateCount}
                            </p>
                            <p className={mutedBodyClassName}>
                                Equivocations:{' '}
                                {poll.boardAudit.equivocationCount}
                            </p>
                        </div>

                        <div className="space-y-2 border-t border-border/60 pt-4">
                            <p className={mutedBodyClassName}>
                                Reconstruction threshold:{' '}
                                {poll.thresholds.reconstructionThreshold ??
                                    'Pending'}
                            </p>
                            <p className={mutedBodyClassName}>
                                This is the number of valid decryption shares
                                needed before the tally can be opened.
                            </p>
                            <p className={mutedBodyClassName}>
                                Minimum published voter count:{' '}
                                {poll.thresholds.minimumPublishedVoterCount ??
                                    'Pending'}
                            </p>
                            <p className={mutedBodyClassName}>
                                This is the publication floor. Results stay
                                unpublished until at least this many accepted
                                voters exist.
                            </p>
                        </div>

                        <div className="space-y-2 border-t border-border/60 pt-4">
                            <p className={mutedBodyClassName}>
                                Accepted ballots: {acceptedBallots}
                            </p>
                            <p className={mutedBodyClassName}>
                                Accepted decryption shares:{' '}
                                {acceptedDecryptionShares}
                            </p>
                            <div className="space-y-1">
                                <p className={mutedBodyClassName}>
                                    Ceremony digest
                                </p>
                                <p className="break-all font-mono text-xs text-muted-foreground sm:text-sm">
                                    {poll.boardAudit.ceremonyDigest ??
                                        'Pending'}
                                </p>
                            </div>
                        </div>

                        {poll.boardAudit.phaseDigests.length > 0 && (
                            <div className="space-y-2 border-t border-border/60 pt-4">
                                <h3 className="text-base font-semibold">
                                    Phase digests
                                </h3>
                                <div className="space-y-2">
                                    {poll.boardAudit.phaseDigests.map(
                                        (phaseDigest) => (
                                            <div
                                                className="rounded-[var(--radius-md)] border border-border/70 bg-card px-3 py-3"
                                                key={phaseDigest.phase}
                                            >
                                                <p className="text-sm font-medium">
                                                    Phase {phaseDigest.phase}
                                                </p>
                                                <p className="break-all text-sm text-muted-foreground">
                                                    {phaseDigest.digest}
                                                </p>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        )}
                    </Panel>

                    <Panel className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className={sectionTitleClassName}>
                                Board activity
                            </h2>
                            {isFetching && <Spinner className="size-5" />}
                        </div>
                        {poll.boardEntries.length === 0 ? (
                            <p className="empty-state">
                                No board activity has been published yet.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {poll.boardEntries.slice(-12).map((entry) => (
                                    <div
                                        className="rounded-[var(--radius-md)] border border-border/70 bg-card px-3 py-3"
                                        key={entry.id}
                                    >
                                        <p className="text-sm font-medium">
                                            Phase {entry.phase} /{' '}
                                            {entry.messageType}
                                        </p>
                                        <p className={mutedBodyClassName}>
                                            Participant {entry.participantIndex}
                                            . {entry.classification}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </aside>
            </div>
        </section>
    );
};

export default PollPage;
