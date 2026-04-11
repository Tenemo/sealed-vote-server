import { normalizeTrimmedString } from '@sealed-vote/contracts';
import React, { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import ChoiceAdding from './ChoiceAdding';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
import { actionButtonClassName, pageTitleClassName } from '@/lib/uiClasses';
import DocumentSeo from 'app/DocumentSeo';
import { buildCreatePageSeo } from 'app/seo';
import LoadingButton from 'components/LoadingButton';
import { generateClientToken } from 'features/Polls/clientToken';
import { saveCreatorSession } from 'features/Polls/creatorSessionStorage';
import { useCreatePollMutation } from 'features/Polls/pollsApi';
import { renderError } from 'utils/networkErrors';

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
    const pageTitleId = React.useId();
    const [createPoll, { isLoading, error }] = useCreatePollMutation();
    const [form, setForm] = useState<Form>(initialForm);
    const [creatorToken, setCreatorToken] = useState<string | null>(null);
    const runtimeOrigin =
        typeof window === 'undefined' ? undefined : window.location.origin;
    const createPageSeo = React.useMemo(
        () =>
            buildCreatePageSeo({
                origin: runtimeOrigin,
            }),
        [runtimeOrigin],
    );

    const onFormChange = ({
        target: { id, value },
    }: ChangeEvent<HTMLInputElement>): void => {
        setCreatorToken(null);
        setForm((previousForm) => ({ ...previousForm, [id]: value }));
    };

    const onAddChoice = (choice: string): void => {
        setCreatorToken(null);
        setForm((previousForm) => ({
            ...previousForm,
            choices: [...previousForm.choices, choice],
        }));
    };

    const onRemoveChoice = (choice: string): void => {
        setCreatorToken(null);
        setForm((previousForm) => ({
            ...previousForm,
            choices: previousForm.choices.filter(
                (currentChoice) => currentChoice !== choice,
            ),
        }));
    };

    const normalizedPollName = normalizeTrimmedString(form.pollName);
    const isFormValid = !!normalizedPollName && form.choices.length > 1;

    const onCreatePoll = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        if (!isFormValid || isLoading) {
            return;
        }

        const nextCreatorToken = creatorToken ?? generateClientToken();
        setCreatorToken(nextCreatorToken);

        void createPoll({
            pollName: normalizedPollName,
            choices: form.choices,
            creatorToken: nextCreatorToken,
            protocolVersion: 'v1',
        })
            .unwrap()
            .then(({ creatorToken: confirmedCreatorToken, id, slug }) => {
                saveCreatorSession({
                    creatorToken: confirmedCreatorToken,
                    pollId: id,
                    pollSlug: slug,
                });
                void navigate(`/votes/${slug}`);
            })
            .catch(() => undefined);
    };

    return (
        <>
            <DocumentSeo metadata={createPageSeo} />
            <section className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-8">
                <div className="space-y-3 text-center">
                    <h1 className={pageTitleClassName} id={pageTitleId}>
                        Create a new vote
                    </h1>
                    <p className="page-lead mx-auto max-w-2xl">
                        Create a score vote, share the link, let people join,
                        and start voting once the roster looks right.
                    </p>
                </div>
                <form
                    aria-labelledby={pageTitleId}
                    className="space-y-6"
                    noValidate
                    onSubmit={onCreatePoll}
                >
                    <Panel className="space-y-6">
                        <OutlinedInputField
                            autoComplete="off"
                            helperText="What would you like to vote on?"
                            id="pollName"
                            label="Vote name"
                            maxLength={64}
                            name="pollName"
                            onChange={onFormChange}
                            required
                            value={form.pollName}
                        />
                        <ChoiceAdding
                            choices={form.choices}
                            onAddChoice={onAddChoice}
                            onRemoveChoice={onRemoveChoice}
                        />
                        <p className="field-note">
                            The decryption threshold is chosen on the live poll
                            page right before voting starts, so it can follow
                            the actual participant count.
                        </p>
                        <p className="field-note">
                            This version uses token-only enrollment. The public
                            roster is auditable, but the app does not claim
                            strong identity binding or Sybil resistance.
                        </p>
                    </Panel>
                    {error && (
                        <Alert announcement="assertive" variant="destructive">
                            <AlertDescription>
                                {renderError(error)}
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="flex justify-end">
                        <LoadingButton
                            className={actionButtonClassName}
                            disabled={!isFormValid || isLoading}
                            loading={isLoading}
                            loadingLabel="Creating vote"
                            size="lg"
                            type="submit"
                        >
                            Create vote
                        </LoadingButton>
                    </div>
                </form>
            </section>
        </>
    );
};

export default PollCreationPage;
