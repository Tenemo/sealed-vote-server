import React, { useState, type ChangeEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import ChoiceAdding from './ChoiceAdding';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
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
            <section className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-8">
                <div className="space-y-3 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Create a new vote
                    </h1>
                    <p className="mx-auto max-w-2xl text-base leading-7 text-secondary sm:text-lg">
                        Give the vote a clear name, add a few choices, and share
                        the generated link when you are ready.
                    </p>
                </div>
                <Panel className="space-y-6">
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
                    />
                    <ChoiceAdding
                        choices={form.choices}
                        onAddChoice={onAddChoice}
                        onRemoveChoice={onRemoveChoice}
                    />
                </Panel>
                {(error || isLoading) && (
                    <div className="space-y-3">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {renderError(error)}
                                </AlertDescription>
                            </Alert>
                        )}
                        {isLoading && <Spinner className="size-6" />}
                    </div>
                )}
                <div className="flex justify-end">
                    <Button
                        className="w-full sm:w-auto"
                        disabled={!isFormValid}
                        onClick={onCreatePoll}
                        size="lg"
                    >
                        Create vote
                    </Button>
                </div>
            </section>
        </>
    );
};

export default PollCreationPage;
