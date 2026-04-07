import React from 'react';

import { Button } from '@/components/ui/button';
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
    return (
        <li className="rounded-xl border border-border/70 bg-background/25 p-4 sm:p-5">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight sm:text-xl">
                    {choiceName}
                </h3>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {SCORE_CHOICES.map((scoreChoice) => (
                        <Button
                            aria-pressed={scoreChoice === selectedScore}
                            className={cn(
                                'h-11 w-full px-0 text-base',
                                scoreChoice === selectedScore &&
                                    'shadow-[0_16px_32px_rgba(255,255,255,0.08)]',
                            )}
                            key={scoreChoice}
                            onClick={() => onVote(choiceName, scoreChoice)}
                            variant={
                                scoreChoice === selectedScore
                                    ? 'default'
                                    : 'outline'
                            }
                        >
                            {scoreChoice}
                        </Button>
                    ))}
                </div>
            </div>
        </li>
    );
};

export default VoteItem;
