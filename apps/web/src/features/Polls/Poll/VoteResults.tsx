import {
    type PublishedResultVerification,
    verifyPublishedResults,
} from '@sealed-vote/protocol';
import React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { type PollResponse } from 'features/Polls/pollsApi';

type VoteResultsProps = {
    poll: PollResponse;
    pollId: string;
};

const reportVerificationMismatch = async ({
    pollId,
    verification,
}: {
    pollId: string;
    verification: PublishedResultVerification;
}): Promise<void> => {
    const message = `Public result verification failed for poll ${pollId}.`;
    console.error(message, verification);

    try {
        const Sentry = await import('@sentry/react');
        Sentry.captureMessage(message, {
            extra: verification,
            level: 'error',
            tags: {
                area: 'vote-results',
                pollId,
            },
        });
    } catch {
        // Ignore reporting failures so the results UI keeps working.
    }
};

const VoteResults = ({ poll, pollId }: VoteResultsProps): React.JSX.Element => {
    const headingId = React.useId();
    const verificationState = React.useMemo(() => {
        if (!poll.resultScores.length) {
            return {
                error: null,
                verification: null,
            };
        }

        try {
            return {
                error: null,
                verification: verifyPublishedResults({
                    encryptedTallies: poll.encryptedTallies,
                    publishedDecryptionShares: poll.publishedDecryptionShares,
                    resultTallies: poll.resultTallies,
                    resultScores: poll.resultScores,
                    voterCount: poll.voters.length,
                }),
            };
        } catch (error) {
            return {
                error,
                verification: null,
            };
        }
    }, [
        poll.encryptedTallies,
        poll.publishedDecryptionShares,
        poll.resultScores,
        poll.resultTallies,
        poll.voters.length,
    ]);

    React.useEffect(() => {
        if (verificationState.error) {
            console.error(
                `Public result verification crashed for poll ${pollId}.`,
                verificationState.error,
            );
            return;
        }

        if (
            !verificationState.verification ||
            verificationState.verification.isVerified
        ) {
            return;
        }

        void reportVerificationMismatch({
            pollId,
            verification: verificationState.verification,
        });
    }, [pollId, verificationState]);

    if (!poll.resultScores.length) {
        return <></>;
    }

    const sortedResults = poll.choices
        .map(
            (choiceName, index) =>
                [choiceName, poll.resultScores[index] ?? 0] as const,
        )
        .sort((left, right) => right[1] - left[1])
        .map(([choiceName, score]) => [choiceName, score.toFixed(2)] as const);

    return (
        <Panel aria-labelledby={headingId} className="space-y-5">
            <div className="space-y-2">
                <h2
                    className="text-2xl font-semibold tracking-tight"
                    id={headingId}
                >
                    Results
                </h2>
                <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                    Ordered by geometric mean across all submitted votes.
                </p>
            </div>
            {verificationState.verification?.isVerified ? (
                <Alert variant="info">
                    <AlertDescription>
                        Public verification passed. The published tallies and
                        scores match the encrypted tallies and published
                        decryption shares.
                    </AlertDescription>
                </Alert>
            ) : (
                <Alert>
                    <AlertDescription>
                        Public verification failed. Showing the published scores
                        anyway, but the completed poll data does not validate
                        locally.
                    </AlertDescription>
                </Alert>
            )}
            <ol className="space-y-3">
                {sortedResults.map(([choiceName, score], index) => (
                    <Panel
                        asChild
                        className="flex items-start gap-3"
                        key={choiceName}
                        padding="row"
                        radius="compact"
                        tone="subtle"
                    >
                        <li>
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold text-foreground">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-base font-medium text-foreground">
                                    {choiceName}
                                </p>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Score: {score}
                                </p>
                            </div>
                        </li>
                    </Panel>
                ))}
            </ol>
        </Panel>
    );
};

export default VoteResults;
