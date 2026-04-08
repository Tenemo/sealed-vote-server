import { computeGeometricMean } from '@sealed-vote/protocol';
import { Medal, Trophy } from 'lucide-react';
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
        <Panel className="space-y-5">
            <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">
                    Results
                </h2>
                <p className="text-sm leading-7 text-secondary sm:text-base">
                    Ranked by geometric mean across all submitted votes.
                </p>
            </div>
            <ol className="space-y-3">
                {sortedResults.map(([choiceName, score], index) => (
                    <li
                        className="flex items-start gap-4 rounded-xl border border-border/70 bg-background/25 px-4 py-4"
                        key={choiceName}
                    >
                        {index === 0 && <Trophy className="size-5" />}
                        {(index === 1 || index === 2) && (
                            <Medal className="size-5" />
                        )}
                        {index > 2 && <span className="inline-block size-5" />}
                        <div className="flex flex-col gap-1">
                            <span className="text-base font-medium">
                                {choiceName}
                            </span>
                            <span className="text-sm leading-6 text-secondary">
                                Score: {score}
                            </span>
                        </div>
                    </li>
                ))}
            </ol>
        </Panel>
    );
};

export default VoteResults;
