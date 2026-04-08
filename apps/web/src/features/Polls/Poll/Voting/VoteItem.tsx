import React, { useId } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
    choiceName: string;
    onVote: (choiceName: string, score: number) => void;
    selectedScore: number;
};

const SCORE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const VoteItem = ({
    choiceName,
    onVote,
    selectedScore,
}: Props): React.JSX.Element => {
    const radioGroupName = useId();

    return (
        <li className="rounded-xl border border-border/70 bg-background/25 p-4 sm:p-5">
            <fieldset className="space-y-4">
                <legend className="sr-only">{`Score for ${choiceName}`}</legend>
                <h3 className="text-lg font-semibold tracking-tight sm:text-xl">
                    {choiceName}
                </h3>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {SCORE_CHOICES.map((scoreChoice) => (
                        <div className="relative" key={scoreChoice}>
                            <input
                                aria-label={`Score ${scoreChoice} for ${choiceName}`}
                                checked={scoreChoice === selectedScore}
                                className="peer sr-only"
                                id={`${radioGroupName}-${scoreChoice}`}
                                name={radioGroupName}
                                onChange={() => onVote(choiceName, scoreChoice)}
                                type="radio"
                                value={scoreChoice}
                            />
                            <label
                                className={cn(
                                    buttonVariants({
                                        size: 'default',
                                        variant:
                                            scoreChoice === selectedScore
                                                ? 'default'
                                                : 'outline',
                                    }),
                                    'h-11 w-full cursor-pointer px-0 text-base peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
                                )}
                                htmlFor={`${radioGroupName}-${scoreChoice}`}
                            >
                                {scoreChoice}
                            </label>
                        </div>
                    ))}
                </div>
            </fieldset>
        </li>
    );
};

export default VoteItem;
