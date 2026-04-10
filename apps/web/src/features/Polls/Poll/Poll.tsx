import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { mutedBodyClassName, pageTitleClassName } from '@/lib/uiClasses';
import NotFound from 'components/NotFound/NotFound';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
} from 'features/Polls/creatorSessionStorage';
import {
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    saveVoterSession,
} from 'features/Polls/voterSessionStorage';
import {
    useClosePollMutation,
    useGetPollQuery,
    usePostBoardMessageMutation,
    useRegisterVoterMutation,
} from 'features/Polls/pollsApi';
import { renderError } from 'utils/networkErrors';

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
    const [closePoll, closeState] = useClosePollMutation();
    const [postBoardMessage, postBoardState] = usePostBoardMessageMutation();
    const [voterName, setVoterName] = useState('');
    const [boardMessageText, setBoardMessageText] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [localNotice, setLocalNotice] = useState<string | null>(null);
    const voterNameInputId = React.useId();
    const boardMessageInputId = React.useId();

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
            const response = await registerVoter({
                pollId: poll.id,
                voterData: {
                    voterName: voterName.trim(),
                    voterToken:
                        crypto.randomUUID().replaceAll('-', '') +
                        crypto.randomUUID().replaceAll('-', ''),
                },
            }).unwrap();

            saveVoterSession({
                pollId: poll.id,
                pollSlug: poll.slug,
                voterIndex: response.voterIndex,
                voterName: response.voterName,
                voterToken: response.voterToken,
            });
            setLocalNotice(
                `Registered as ${response.voterName} with participant index ${response.voterIndex}.`,
            );
            setVoterName('');
            await refetch();
        } catch (submissionError) {
            setLocalError(renderError(submissionError));
        }
    };

    const onClosePoll = async (): Promise<void> => {
        if (!poll || !creatorSession) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            await closePoll({
                pollId: poll.id,
                closeData: {
                    creatorToken: creatorSession.creatorToken,
                },
            }).unwrap();
            setLocalNotice(
                'Registrations closed. The board ceremony can begin.',
            );
            await refetch();
        } catch (submissionError) {
            setLocalError(renderError(submissionError));
        }
    };

    const onPostBoardMessage = async (
        event: React.FormEvent<HTMLFormElement>,
    ): Promise<void> => {
        event.preventDefault();

        if (!poll || !voterSession) {
            return;
        }

        setLocalError(null);
        setLocalNotice(null);

        try {
            const parsedPayload = JSON.parse(boardMessageText);

            await postBoardMessage({
                pollId: poll.id,
                boardMessage: {
                    voterToken: voterSession.voterToken,
                    signedPayload: parsedPayload,
                },
            }).unwrap();

            setLocalNotice('Board message posted successfully.');
            setBoardMessageText('');
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

    const acceptedBallots = boardMessageCount(
        poll.boardEntries,
        'ballot-submission',
    );
    const acceptedDecryptionShares = boardMessageCount(
        poll.boardEntries,
        'decryption-share',
    );
    const acceptedTallies = boardMessageCount(
        poll.boardEntries,
        'tally-publication',
    );

    return (
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <Panel className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                        <h1 className={pageTitleClassName}>{poll.pollName}</h1>
                        <p className={mutedBodyClassName}>
                            Phase: {poll.phase}. Session fingerprint:{' '}
                            {poll.sessionFingerprint ?? 'not available yet'}.
                        </p>
                        <p className={mutedBodyClassName}>
                            {poll.isOpen
                                ? 'Registrations are still open.'
                                : 'Registrations are closed and the board log is authoritative.'}
                        </p>
                    </div>
                    {creatorSession && poll.isOpen && (
                        <Button
                            disabled={closeState.isLoading}
                            onClick={() => void onClosePoll()}
                            size="lg"
                        >
                            Close registrations
                        </Button>
                    )}
                </div>
                {poll.voters.length > poll.thresholds.validationTarget && (
                    <Alert variant="info">
                        <AlertDescription>
                            This ceremony exceeds the currently validated target
                            of {poll.thresholds.validationTarget} participants
                            and should be treated as experimental.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="grid gap-4 md:grid-cols-3">
                    <Panel padding="compact" tone="subtle">
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">
                                Thresholds
                            </h2>
                            <p className={mutedBodyClassName}>
                                Reconstruction threshold:{' '}
                                {poll.thresholds.reconstructionThreshold ??
                                    'pending'}
                            </p>
                            <p className={mutedBodyClassName}>
                                Minimum published voter count:{' '}
                                {poll.thresholds.minimumPublishedVoterCount ??
                                    'pending'}
                            </p>
                        </div>
                    </Panel>
                    <Panel padding="compact" tone="subtle">
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">
                                Board audit
                            </h2>
                            <p className={mutedBodyClassName}>
                                Accepted messages:{' '}
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
                    </Panel>
                    <Panel padding="compact" tone="subtle">
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">
                                Ceremony progress
                            </h2>
                            <p className={mutedBodyClassName}>
                                Accepted ballots: {acceptedBallots}
                            </p>
                            <p className={mutedBodyClassName}>
                                Accepted decryption shares:{' '}
                                {acceptedDecryptionShares}
                            </p>
                            <p className={mutedBodyClassName}>
                                Published tallies: {acceptedTallies}
                            </p>
                        </div>
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
                    <AlertDescription>{renderError(error)}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <Panel className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold">Verification</h2>
                        <p className={mutedBodyClassName}>
                            Status: {poll.verification.status}
                        </p>
                        {poll.verification.reason && (
                            <p className={mutedBodyClassName}>
                                {poll.verification.reason}
                            </p>
                        )}
                    </div>
                    {poll.verification.verifiedOptionTallies.length > 0 ? (
                        <div className="space-y-3">
                            {poll.verification.verifiedOptionTallies.map(
                                (result) => (
                                    <div
                                        className="rounded-[var(--radius-md)] border border-border bg-card p-4"
                                        key={result.optionIndex}
                                    >
                                        <p className="font-semibold">
                                            {poll.choices[
                                                result.optionIndex - 1
                                            ] ?? `Option ${result.optionIndex}`}
                                        </p>
                                        <p className={mutedBodyClassName}>
                                            Verified tally: {result.tally}
                                        </p>
                                        <p className={mutedBodyClassName}>
                                            Arithmetic mean: {result.mean}
                                        </p>
                                        <p className={mutedBodyClassName}>
                                            Accepted ballots:{' '}
                                            {result.acceptedBallotCount}
                                        </p>
                                    </div>
                                ),
                            )}
                        </div>
                    ) : (
                        <p className={mutedBodyClassName}>
                            Verified option tallies will appear here once the
                            ceremony reaches a publishable state.
                        </p>
                    )}
                    <div className="space-y-2">
                        <h3 className="text-base font-semibold">
                            Manifest and digests
                        </h3>
                        <p className={mutedBodyClassName}>
                            Manifest hash:{' '}
                            {poll.manifestHash ?? 'not published'}
                        </p>
                        <p className={mutedBodyClassName}>
                            Session ID: {poll.sessionId ?? 'not published'}
                        </p>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            {poll.boardAudit.phaseDigests.map((phaseDigest) => (
                                <li key={phaseDigest.phase}>
                                    Phase {phaseDigest.phase}:{' '}
                                    {phaseDigest.digest}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Panel>

                <div className="space-y-6">
                    <Panel className="space-y-4">
                        <h2 className="text-xl font-semibold">Participants</h2>
                        <ul className="space-y-2">
                            {poll.voters.map((participant) => (
                                <li
                                    className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2"
                                    key={participant.voterIndex}
                                >
                                    {participant.voterIndex}.{' '}
                                    {participant.voterName}
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    {poll.isOpen && !voterSession && (
                        <Panel className="space-y-4">
                            <h2 className="text-xl font-semibold">
                                Register as a participant
                            </h2>
                            <form
                                className="space-y-4"
                                onSubmit={(event) => void onRegister(event)}
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
                                            setVoterName(event.target.value)
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
                                    Register
                                </Button>
                            </form>
                        </Panel>
                    )}

                    {voterSession && !poll.isOpen && (
                        <Panel className="space-y-4">
                            <div className="space-y-1">
                                <h2 className="text-xl font-semibold">
                                    Post a signed board message
                                </h2>
                                <p className={mutedBodyClassName}>
                                    Logged in as {voterSession.voterName} (
                                    participant {voterSession.voterIndex}).
                                </p>
                            </div>
                            <form
                                className="space-y-4"
                                onSubmit={(event) =>
                                    void onPostBoardMessage(event)
                                }
                            >
                                <label
                                    className="flex flex-col gap-2"
                                    htmlFor={boardMessageInputId}
                                >
                                    <span className="text-sm font-medium">
                                        Signed payload JSON
                                    </span>
                                    <textarea
                                        className="min-h-48 rounded-[var(--radius-md)] border border-border bg-background px-3 py-3 font-mono text-sm"
                                        id={boardMessageInputId}
                                        onChange={(event) =>
                                            setBoardMessageText(
                                                event.target.value,
                                            )
                                        }
                                        value={boardMessageText}
                                    />
                                </label>
                                <Button
                                    disabled={
                                        postBoardState.isLoading ||
                                        !boardMessageText.trim()
                                    }
                                    size="lg"
                                    type="submit"
                                >
                                    Append to board
                                </Button>
                            </form>
                        </Panel>
                    )}
                </div>
            </div>

            <Panel className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Board log</h2>
                    {isFetching && <Spinner className="size-5" />}
                </div>
                <div className="space-y-3">
                    {poll.boardEntries.map((entry) => (
                        <div
                            className="rounded-[var(--radius-md)] border border-border bg-card p-4"
                            key={entry.id}
                        >
                            <p className="font-semibold">
                                Phase {entry.phase} / {entry.messageType}
                            </p>
                            <p className={mutedBodyClassName}>
                                Participant {entry.participantIndex}. Slot:{' '}
                                {entry.slotKey}
                            </p>
                            <p className={mutedBodyClassName}>
                                Classification: {entry.classification}
                            </p>
                            <p className={mutedBodyClassName}>
                                Entry hash: {entry.entryHash}
                            </p>
                            <details className="pt-2">
                                <summary className="cursor-pointer text-sm font-medium">
                                    Show signed payload
                                </summary>
                                <pre className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-border bg-background p-3 text-xs leading-6">
                                    {JSON.stringify(
                                        entry.signedPayload,
                                        null,
                                        2,
                                    )}
                                </pre>
                            </details>
                        </div>
                    ))}
                    {poll.boardEntries.length === 0 && (
                        <p className={mutedBodyClassName}>
                            No board messages have been published yet.
                        </p>
                    )}
                </div>
            </Panel>
        </section>
    );
};

export default PollPage;
