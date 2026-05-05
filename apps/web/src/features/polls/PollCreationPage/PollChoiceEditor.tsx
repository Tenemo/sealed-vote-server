import {
    normalizeTrimmedString,
    normalizeTrimmedStrings,
} from '@sealed-vote/contracts';
import { Plus, Trash2 } from 'lucide-react';
import React, { useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { cn } from '@/lib/utils';

type PollChoiceEditorProps = {
    choices: string[];
    onAddChoice: (choice: string) => void;
    onRemoveChoice: (choice: string) => void;
};

const PollChoiceEditor = ({
    choices,
    onAddChoice,
    onRemoveChoice,
}: PollChoiceEditorProps): React.JSX.Element => {
    const choiceNameErrorId = 'choice-name-error';
    const [choiceName, setChoiceName] = useState('');
    const normalizedChoiceName = normalizeTrimmedString(choiceName);
    const normalizedChoices = normalizeTrimmedStrings(choices);
    const isChoiceDuplicate = normalizedChoices.includes(normalizedChoiceName);
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
                <h2 className="text-xl font-semibold">Choices</h2>
                <p className="field-note">
                    Each participant will score every option from 1 to 10.
                </p>
            </div>
            <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <OutlinedInputField
                        aria-describedby={
                            isChoiceDuplicate ? choiceNameErrorId : undefined
                        }
                        aria-invalid={isChoiceDuplicate}
                        autoComplete="off"
                        id="choiceName"
                        inputClassName="text-base"
                        label="Choice name"
                        maxLength={64}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        value={choiceName}
                    />
                    <Button
                        className={cn('w-full sm:w-auto', 'justify-center')}
                        disabled={!isChoiceNameValid}
                        onClick={handleAddChoice}
                        size="lg"
                        type="button"
                        variant={isChoiceNameValid ? 'default' : 'outline'}
                    >
                        <Plus aria-hidden="true" className="size-4" />
                        Add new choice
                    </Button>
                </div>
                {isChoiceDuplicate ? (
                    <p
                        className="text-sm font-normal text-destructive"
                        id={choiceNameErrorId}
                        role="alert"
                    >
                        This choice already exists
                    </p>
                ) : null}
            </div>
            {choices.length === 0 && (
                <p className="empty-state">
                    To create a poll, add choices that each participant will be
                    able to score from 1 to 10.
                </p>
            )}
            {!!choices.length && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-secondary">
                        Choices currently in the poll:
                    </p>
                    <ul className="space-y-2">
                        {choices.map((choice) => (
                            <li
                                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3"
                                key={choice}
                            >
                                <span className="block min-w-0 flex-1 text-base font-medium [overflow-wrap:anywhere]">
                                    {choice}
                                </span>
                                <Button
                                    aria-label={`Remove choice ${choice}`}
                                    onClick={() => onRemoveChoice(choice)}
                                    size="icon-sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Trash2
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {choices.length === 1 && (
                <p className="field-note">
                    There need to be at least two possible choices in a poll.
                </p>
            )}
        </div>
    );
};

export default PollChoiceEditor;
