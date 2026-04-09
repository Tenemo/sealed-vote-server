import { Medal, Trophy } from 'lucide-react';
import React from 'react';

import { buildVoteResultsViewModel } from './voteResultsViewModel';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { sectionTitleClassName } from '@/lib/uiClasses';
import { type PollResponse } from 'features/Polls/pollsApi';

type VoteResultsProps = {
    poll: PollResponse;
    pollId: string;
};

const VoteResults = ({ poll, pollId }: VoteResultsProps): React.JSX.Element => {
    const headingId = React.useId();
    const viewModel = React.useMemo(
        () => buildVoteResultsViewModel(poll),
        [poll],
    );

    React.useEffect(() => {
        if (!viewModel) {
            return;
        }

        if (viewModel.verificationError) {
            console.error(
                `Public result verification crashed for poll ${pollId}.`,
                viewModel.verificationError,
            );
            return;
        }

        if (!viewModel.verification || viewModel.verification.isVerified) {
            return;
        }

        console.error(
            `Public result verification failed for poll ${pollId}.`,
            viewModel.verification,
        );
    }, [pollId, viewModel]);

    if (!viewModel) {
        return <></>;
    }

    return (
        <Panel asChild className="space-y-5">
            <section aria-labelledby={headingId}>
                <div className="space-y-1">
                    <h2 className={sectionTitleClassName} id={headingId}>
                        Results
                    </h2>
                    <p className="field-note">
                        Ordered by geometric mean across all submitted votes.
                    </p>
                </div>
                {viewModel.verificationError ? (
                    <Alert>
                        <AlertDescription>
                            Public verification could not be completed locally.
                            Showing the published scores anyway.
                        </AlertDescription>
                    </Alert>
                ) : viewModel.verification?.isVerified ? (
                    <Alert variant="info">
                        <AlertDescription>
                            Public verification passed. The published tallies
                            and scores match the encrypted tallies and published
                            decryption shares.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert>
                        <AlertDescription>
                            Public verification failed. Showing the published
                            scores anyway, but the completed poll data does not
                            validate locally.
                        </AlertDescription>
                    </Alert>
                )}
                <ol className="space-y-3">
                    {viewModel.results.map(
                        ({ choiceName, scoreLabel }, index) => (
                            <Panel
                                asChild
                                className="flex items-start gap-4"
                                key={choiceName}
                                padding="row"
                                radius="compact"
                            >
                                <li>
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-foreground">
                                        {index === 0 && (
                                            <Trophy
                                                aria-label="Winner"
                                                className="size-5"
                                            />
                                        )}
                                        {(index === 1 || index === 2) && (
                                            <Medal
                                                aria-label={
                                                    index === 1
                                                        ? 'Runner-up'
                                                        : 'Third place'
                                                }
                                                className="size-5"
                                            />
                                        )}
                                        {index > 2 && (
                                            <span
                                                aria-hidden="true"
                                                className="size-5"
                                            />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-medium [overflow-wrap:anywhere]">
                                            {choiceName}
                                        </p>
                                        <p className="text-sm leading-6 text-secondary">
                                            Score: {scoreLabel}
                                        </p>
                                    </div>
                                </li>
                            </Panel>
                        ),
                    )}
                </ol>
            </section>
        </Panel>
    );
};

export default VoteResults;
