import { Plus, Trash2 } from 'lucide-react';
import React, { useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
      <div className="w-full rounded-md bg-accent p-2 sm:w-10/12 md:w-8/12 lg:w-6/12 xl:w-4/12">
        <div className="flex min-h-[100px] flex-wrap items-center justify-center">
          <Field className="m-1 min-w-[240px] flex-1">
            <FieldLabel htmlFor="choiceName">Choice to vote for</FieldLabel>
            <Input
              aria-invalid={isChoiceDuplicate}
              autoComplete="off"
              id="choiceName"
              maxLength={64}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              value={choiceName}
            />
            <FieldError>
              {isChoiceDuplicate ? 'This choice already exists' : undefined}
            </FieldError>
          </Field>
          <Button
            className="m-1 mb-2 self-start"
            disabled={!isChoiceNameValid}
            onClick={handleAddChoice}
            type="button"
            variant="outline"
          >
            <Plus className="mr-2 size-4" />
            Add new choice
          </Button>
        </div>
        {choices.length === 0 && (
          <FieldDescription className="m-1">
            To create a vote, add choices that each participant will be able to
            rank from 1 to 10.
          </FieldDescription>
        )}
        {!!choices.length && (
          <>
            <p className="m-1">Choices currently in the vote:</p>
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
          <p className="m-1">
            There need to be at least two possible choices in a vote.
          </p>
        )}
      </div>
    </div>
  );
};

export default ChoiceAdding;
