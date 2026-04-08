import { Plus, Trash2 } from 'lucide-react';
import React, { useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
import { actionButtonClassName, mutedBodyClassName } from '@/lib/uiClasses';
import { cn } from '@/lib/utils';

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
                <p className={mutedBodyClassName}>
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
                        className={cn(actionButtonClassName, 'justify-center')}
                        disabled={!isChoiceNameValid}
                        onClick={handleAddChoice}
                        size="lg"
                        type="button"
                        variant="secondary"
                    >
                        <Plus aria-hidden="true" className="mr-2 size-4" />
                        Add new choice
                    </Button>
                </div>
            </div>
            {choices.length === 0 && (
                <Panel
                    borderStyle="dashed"
                    className={mutedBodyClassName}
                    padding="row"
                    radius="compact"
                    tone="subtle"
                >
                    To create a vote, add choices that each participant will be
                    able to rank from 1 to 10.
                </Panel>
            )}
            {!!choices.length && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                        Choices currently in the vote:
                    </p>
                    <ul className="space-y-2">
                        {choices.map((choice) => (
                            <Panel
                                asChild
                                className="flex items-center justify-between gap-3"
                                key={choice}
                                padding="row"
                                radius="compact"
                                tone="subtle"
                            >
                                <li>
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
                                        <Trash2
                                            aria-hidden="true"
                                            className="size-4"
                                        />
                                    </Button>
                                </li>
                            </Panel>
                        ))}
                    </ul>
                </div>
            )}
            {choices.length === 1 && (
                <p className={mutedBodyClassName}>
                    There need to be at least two possible choices in a vote.
                </p>
            )}
        </div>
    );
};

export default ChoiceAdding;
