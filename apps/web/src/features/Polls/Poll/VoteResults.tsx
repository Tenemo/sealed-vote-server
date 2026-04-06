import { computeGeometricMean } from '@sealed-vote/protocol';
import { Medal, Trophy } from 'lucide-react';
import React from 'react';

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
        <div className="flex flex-col items-center rounded bg-accent p-2">
            <h2 className="px-4 py-2 text-xl font-semibold">Results</h2>
            <ul className="w-full">
                {sortedResults.map(([choiceName, score], index) => (
                    <li
                        className="flex items-center gap-3 py-2"
                        key={choiceName}
                    >
                        {index === 0 && <Trophy className="size-5" />}
                        {(index === 1 || index === 2) && (
                            <Medal className="size-5" />
                        )}
                        {index > 2 && <span className="inline-block size-5" />}
                        <div className="flex flex-col">
                            <span className="font-medium">{choiceName}</span>
                            <span className="text-sm text-muted-foreground">
                                Score: {score}
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default VoteResults;
