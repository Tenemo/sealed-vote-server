import { Plus, Trash2 } from 'lucide-react';
import React, { useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FieldDescription } from '@/components/ui/field';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';

type ChoiceAddingProps = {
    choices: string[];
    onAddChoice: (choice: string) => void;
    onRemoveChoice: (choice: string) => void;
};

const ChoiceAdding = ({
    choices,
    onAddChoice,
    onRemoveChoice,
}: ChoiceAddingProps): React.JSX.Element => {
    const [choiceName, setChoiceName] = useState('');
    const normalizedChoiceName = choiceName.trim();
    const isChoiceDuplicate = choices.includes(normalizedChoiceName);
    const isChoiceNameValid = !!normalizedChoiceName && !isChoiceDuplicate;

    const handleAddChoice = (): void => {
        if (!isChoiceNameValid) {
            return;
        }

        onAddChoice(normalizedChoiceName);
        setChoiceName('');
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
        setChoiceName(event.target.value);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleAddChoice();
        }
    };

    return (
        <div className="space-y-5">
            <div className="space-y-2 text-center">
                <h2 className="text-xl font-semibold tracking-tight">
                    Choices
                </h2>
                <p className="text-sm leading-7 text-secondary sm:text-base">
                    Each participant will rank every option from 1 to 10.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <OutlinedInputField
                    aria-invalid={isChoiceDuplicate}
                    autoComplete="off"
                    errorText={
                        isChoiceDuplicate
                            ? 'This choice already exists'
                            : undefined
                    }
                    id="choiceName"
                    inputClassName="text-base"
                    label="Choice to vote for"
                    maxLength={64}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    value={choiceName}
                />
                <div className="sm:pt-7">
                    <Button
                        className="w-full justify-center sm:w-auto enabled:border-border/70 enabled:bg-accent enabled:hover:bg-white/12 enabled:hover:text-foreground enabled:active:bg-white/14"
                        disabled={!isChoiceNameValid}
                        onClick={handleAddChoice}
                        size="lg"
                        type="button"
                        variant="outline"
                    >
                        <Plus className="mr-2 size-4" />
                        Add new choice
                    </Button>
                </div>
            </div>
            {choices.length === 0 && (
                <FieldDescription className="rounded-xl border border-dashed border-border/70 bg-background/20 px-4 py-3 text-sm leading-7 text-secondary">
                    To create a vote, add choices that each participant will be
                    able to rank from 1 to 10.
                </FieldDescription>
            )}
            {!!choices.length && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-secondary">
                        Choices currently in the vote:
                    </p>
                    <ul className="space-y-2">
                        {choices.map((choice) => (
                            <li
                                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-4 py-3"
                                key={choice}
                            >
                                <span className="min-w-0 flex-1 break-words text-base text-foreground">
                                    {choice}
                                </span>
                                <Button
                                    aria-label={`Remove choice ${choice}`}
                                    onClick={() => onRemoveChoice(choice)}
                                    size="icon-sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {choices.length === 1 && (
                <p className="text-sm leading-7 text-secondary">
                    There need to be at least two possible choices in a vote.
                </p>
            )}
        </div>
    );
};

export default ChoiceAdding;
