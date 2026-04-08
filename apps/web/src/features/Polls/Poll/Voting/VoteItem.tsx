import React, { useId } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
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
        <Panel asChild padding="compact" radius="compact" tone="subtle">
            <li>
                <fieldset className="space-y-4">
                    <legend className="text-lg font-semibold tracking-tight sm:text-xl">
                        {choiceName}
                    </legend>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                        {SCORE_CHOICES.map((scoreChoice) => (
                            <div className="relative" key={scoreChoice}>
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
                                        buttonVariants({
                                            size: 'default',
                                            variant:
                                                scoreChoice === selectedScore
                                                    ? 'default'
                                                    : 'outline',
                                        }),
                                        'h-11 w-full cursor-pointer px-0 text-base peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/55 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
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
        </Panel>
    );
};

export default VoteItem;
