import React, { useState, type ChangeEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import ChoiceAdding from './ChoiceAdding';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
            <h2 className="mb-4 mt-8 text-xl font-semibold tracking-tight">
                Create a new vote
            </h2>
            <div className="flex w-full justify-center">
                <div className="w-full p-2 sm:w-10/12 md:w-8/12 lg:w-6/12 xl:w-4/12">
                    <Field>
                        <FieldLabel htmlFor="pollName">Vote name</FieldLabel>
                        <Input
                            autoComplete="off"
                            id="pollName"
                            maxLength={64}
                            name="pollName"
                            onChange={onFormChange}
                            required
                            value={pollName}
                        />
                        {!pollName && (
                            <FieldDescription>
                                What would you like to vote on?
                            </FieldDescription>
                        )}
                    </Field>
                </div>
            </div>
            <ChoiceAdding
                choices={form.choices}
                onAddChoice={onAddChoice}
                onRemoveChoice={onRemoveChoice}
            />
            <Button
                className="m-2"
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
