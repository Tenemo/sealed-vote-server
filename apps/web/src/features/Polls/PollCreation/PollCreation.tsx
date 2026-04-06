import React, { useState, type ChangeEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import ChoiceAdding from './ChoiceAdding';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Spinner } from '@/components/ui/spinner';
import { useCreatePollMutation } from 'features/Polls/pollsApi';
import { renderError } from 'utils/utils';

type Form = {
    pollName: string;
    choices: string[];
};

const initialForm: Form = {
    pollName: '',
    choices: [],
};

const PollCreationPage = (): React.JSX.Element => {
    const navigate = useNavigate();
    const [createPoll, { isLoading, error }] = useCreatePollMutation();

    const [form, setForm] = useState<Form>(initialForm);
    const { pollName, choices } = form;

    const onFormChange = ({
        target: { id, value },
    }: ChangeEvent<HTMLInputElement>): void =>
        setForm({ ...form, [id]: value });

    const onAddChoice = (choice: string): void =>
        setForm((prev) => ({
            ...prev,
            choices: [...prev.choices, choice],
        }));

    const onRemoveChoice = (choice: string): void =>
        setForm((prev) => ({
            ...prev,
            choices: prev.choices.filter(
                (currentChoice) => currentChoice !== choice,
            ),
        }));

    const onCreatePoll = (): void => {
        void createPoll({
            pollName: form.pollName.trim(),
            choices: form.choices,
        })
            .unwrap()
            .then(({ slug }) => {
                void navigate(`/votes/${slug}`);
            });
    };

    const isFormValid = pollName.trim() && choices.length > 1 && !isLoading;

    return (
        <>
            <Helmet>
                <title>Vote creation</title>
            </Helmet>
            <h2 className="mx-auto mb-4 mt-8 w-fit text-2xl leading-8 font-normal text-center">
                Create a new vote
            </h2>
            <div className="flex w-full justify-center">
                <div className="w-full max-w-[720px] p-2">
                    <OutlinedInputField
                        autoComplete="off"
                        helperText={
                            !pollName
                                ? 'What would you like to vote on?'
                                : undefined
                        }
                        id="pollName"
                        label="Vote name"
                        maxLength={64}
                        name="pollName"
                        onChange={onFormChange}
                        required
                        value={pollName}
                        wrapperClassName="mb-2 min-h-20"
                    />
                </div>
            </div>
            <ChoiceAdding
                choices={form.choices}
                onAddChoice={onAddChoice}
                onRemoveChoice={onRemoveChoice}
            />
            <Button
                className="m-2 mt-4"
                disabled={!isFormValid}
                onClick={onCreatePoll}
                size="lg"
            >
                Create vote
            </Button>
            {error && (
                <Alert className="mt-2" variant="destructive">
                    <AlertDescription>{renderError(error)}</AlertDescription>
                </Alert>
            )}
            {isLoading && <Spinner className="mt-2 size-6" />}
        </>
    );
};

export default PollCreationPage;
