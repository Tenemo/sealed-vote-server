import type React from 'react';

import { Panel } from '@/components/ui/panel';

import type { PollData } from './poll-page-types';

type PollResultsPanelProps = {
    poll: PollData;
};

const PollResultsPanel = ({
    poll,
}: PollResultsPanelProps): React.JSX.Element | null => {
    if (poll.verification.status !== 'verified') {
        return null;
    }

    return (
        <Panel className="space-y-4" data-testid="verified-results-panel">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Results</h2>
                <p className="field-note">
                    Arithmetic means are shown in the same 1.0 to 10.0 range
                    that each voter used.
                </p>
            </div>
            <div className="grid gap-3">
                {poll.verification.verifiedOptionTallies.map((result) => (
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
                                    {poll.choices[result.optionIndex - 1]}
                                </div>
                                <div className="text-sm text-secondary">
                                    {result.acceptedBallotCount} accepted
                                    ballots
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
                ))}
            </div>
        </Panel>
    );
};

export default PollResultsPanel;
