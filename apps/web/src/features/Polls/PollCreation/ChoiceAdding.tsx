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
        <div className="flex w-full justify-center">
            <div className="w-full max-w-[720px] rounded-sm bg-accent p-2">
                <div className="flex min-h-[100px] flex-wrap items-center justify-center">
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
                        wrapperClassName="m-1 min-h-20 w-[210px] self-start"
                    />
                    <Button
                        className="m-2 mb-4 h-[36.5px] px-[15px] py-[5px]"
                        disabled={!isChoiceNameValid}
                        onClick={handleAddChoice}
                        type="button"
                        variant="outline"
                    >
                        <Plus className="-ml-1 mr-2 size-4" />
                        Add new choice
                    </Button>
                </div>
                {choices.length === 0 && (
                    <FieldDescription className="m-2 text-base text-foreground">
                        To create a vote, add choices that each participant will
                        be able to rank from 1 to 10.
                    </FieldDescription>
                )}
                {!!choices.length && (
                    <>
                        <p className="m-2">Choices currently in the vote:</p>
                        <ul className="px-4 py-2">
                            {choices.map((choice) => (
                                <li
                                    className="my-2 flex items-center justify-between rounded border border-secondary px-4 py-2"
                                    key={choice}
                                >
                                    <span>{choice}</span>
                                    <Button
                                        aria-label="delete"
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
                    </>
                )}
                {choices.length === 1 && (
                    <p className="m-2">
                        There need to be at least two possible choices in a
                        vote.
                    </p>
                )}
            </div>
        </div>
    );
};

export default ChoiceAdding;
