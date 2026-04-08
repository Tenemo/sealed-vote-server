import {
    type PublishedResultVerification,
    verifyPublishedResults,
} from '@sealed-vote/protocol';
import React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import {
    hasPublishedResults,
    normalizePollResponse,
} from 'features/Polls/pollData';
import { type PollResponse } from 'features/Polls/pollsApi';

type VoteResultsProps = {
    poll: PollResponse;
    pollId: string;
};

const VoteResults = ({ poll, pollId }: VoteResultsProps): React.JSX.Element => {
    const headingId = React.useId();
    const normalizedPoll = React.useMemo(
        () => normalizePollResponse(poll) ?? poll,
        [poll],
    );

    const verificationState = React.useMemo(() => {
        if (!hasPublishedResults(normalizedPoll)) {
            return {
                error: null,
                verification: null,
            };
        }

        try {
            return {
                error: null,
                verification: verifyPublishedResults({
                    encryptedTallies: normalizedPoll.encryptedTallies,
                    publishedDecryptionShares:
                        normalizedPoll.publishedDecryptionShares,
                    resultTallies: normalizedPoll.resultTallies,
                    resultScores: normalizedPoll.resultScores,
                    voterCount: normalizedPoll.voters.length,
                }),
            };
        } catch (error) {
            return {
                error,
                verification: null,
            };
        }
    }, [normalizedPoll]);

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

        const verification: PublishedResultVerification =
            verificationState.verification;
        console.error(
            `Public result verification failed for poll ${pollId}.`,
            verification,
        );
    }, [pollId, verificationState]);

    if (!hasPublishedResults(normalizedPoll)) {
        return <></>;
    }

    const sortedResults = normalizedPoll.choices
        .map(
            (choiceName, index) =>
                [choiceName, normalizedPoll.resultScores[index] ?? 0] as const,
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
            {verificationState.error ? (
                <Alert>
                    <AlertDescription>
                        Public verification could not be completed locally.
                        Showing the published scores anyway.
                    </AlertDescription>
                </Alert>
            ) : verificationState.verification?.isVerified ? (
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
