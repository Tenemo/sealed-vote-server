import React from 'react';

import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

type Props = {
    choiceIndex: number;
    choiceName: string;
    onVote: (choiceName: string, score: number) => void;
    selectedScore: number;
};

const SCORE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const scoreChipClassName =
    'flex h-11 w-full min-w-0 cursor-pointer touch-manipulation items-center justify-center rounded-[var(--radius-md)] border px-0 text-base font-medium transition-[color,background-color,border-color,box-shadow] outline-none select-none [-webkit-tap-highlight-color:transparent] peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/55 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background';
const selectedScoreChipClassName =
    'border-white bg-white text-black hover:border-white hover:bg-white hover:text-black';
const unselectedScoreChipClassName =
    'border-border bg-background text-foreground hover:border-border hover:bg-accent hover:text-foreground';

const VoteItem = ({
    choiceIndex,
    choiceName,
    onVote,
    selectedScore,
}: Props): React.JSX.Element => {
    const radioGroupName = `choice-${choiceIndex}`;

    return (
        <Panel asChild padding="compact" radius="compact" tone="subtle">
            <li>
                <fieldset className="grid gap-4">
                    <legend className="max-w-full text-lg font-semibold whitespace-normal [overflow-wrap:anywhere] sm:text-xl">
                        {choiceName}
                    </legend>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                        {SCORE_CHOICES.map((scoreChoice) => (
                            <div className="min-w-0" key={scoreChoice}>
                                <input
                                    aria-label={`Score ${scoreChoice} for ${choiceName}`}
                                    checked={scoreChoice === selectedScore}
                                    className="peer sr-only"
                                    id={`${radioGroupName}-${scoreChoice}`}
                                    name={radioGroupName}
                                    onChange={() =>
                                        onVote(choiceName, scoreChoice)
                                    }
                                    type="radio"
                                    value={scoreChoice}
                                />
                                <label
                                    className={cn(
                                        scoreChoice === selectedScore
                                            ? selectedScoreChipClassName
                                            : unselectedScoreChipClassName,
                                        scoreChipClassName,
                                    )}
                                    data-selected={
                                        scoreChoice === selectedScore
                                            ? 'true'
                                            : 'false'
                                    }
                                    htmlFor={`${radioGroupName}-${scoreChoice}`}
                                >
                                    {scoreChoice}
                                </label>
                            </div>
                        ))}
                    </div>
                </fieldset>
            </li>
        </Panel>
    );
};

export default VoteItem;
