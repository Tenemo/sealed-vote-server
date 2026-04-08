import { computeGeometricMean } from '@sealed-vote/protocol';
import React from 'react';

import { Panel } from '@/components/ui/panel';
import { useAppSelector } from 'app/hooks';
import { type PollResponse } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

type VoteResultsProps = {
    poll: PollResponse;
    pollId: string;
};

const VoteResults = ({ poll, pollId }: VoteResultsProps): React.JSX.Element => {
    const headingId = React.useId();
    const { results } = useAppSelector((state) =>
        selectVotingStateByPollId(state, pollId),
    );

    const displayedResults =
        results ?? (poll.results.length ? poll.results : null);

    if (!displayedResults) {
        return <></>;
    }

    const geometricMeans = computeGeometricMean(
        displayedResults,
        poll.voters.length,
    );
    const sortedResults = poll.choices
        .map(
            (choiceName, index) => [choiceName, geometricMeans[index]] as const,
        )
        .sort((a, b) => b[1] - a[1])
        .map(([choiceName, score]) => [choiceName, score.toFixed(2)]);

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
