import { normalizeTrimmedString } from '@sealed-vote/contracts';
import React, { useState, type ChangeEvent, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import PollChoiceEditor from './PollChoiceEditor';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
import LoadingButton from 'components/LoadingButton/LoadingButton';
import { generateClientToken } from 'features/polls/client-token';
import { saveCreatorSession } from 'features/polls/poll-session-storage';
import { useCreatePollMutation } from 'features/polls/polls-api';
import { renderError } from 'utils/network-errors';
import {
    buildCreatePageSeo,
    serializeStructuredData,
    siteAuthor,
    siteLocale,
    siteName,
    siteThemeColor,
} from '../../../../config/seo-metadata.mts';

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
                void navigate(`/polls/${slug}`);
            })
            .catch(() => undefined);
    };

    return (
        <>
            <Helmet prioritizeSeoTags>
                <title>{createPageSeo.title}</title>
                <meta content={siteAuthor} name="author" />
                <meta content={siteName} name="application-name" />
                <meta content={siteName} name="apple-mobile-web-app-title" />
                <meta content="dark" name="color-scheme" />
                <meta content={createPageSeo.description} name="description" />
                <meta content="telephone=no" name="format-detection" />
                <meta content={createPageSeo.keywords} name="keywords" />
                <meta content={createPageSeo.robots} name="robots" />
                <meta content={siteThemeColor} name="theme-color" />
                <meta content={createPageSeo.url} name="twitter:url" />
                <meta
                    content={createPageSeo.imageAlt}
                    name="twitter:image:alt"
                />
                <meta content={createPageSeo.imageUrl} name="twitter:image" />
                <meta
                    content={createPageSeo.description}
                    name="twitter:description"
                />
                <meta content={createPageSeo.title} name="twitter:title" />
                <meta content="summary_large_image" name="twitter:card" />
                <meta content={siteName} property="og:site_name" />
                <meta
                    content={createPageSeo.description}
                    property="og:description"
                />
                <meta
                    content={createPageSeo.imageAlt}
                    property="og:image:alt"
                />
                <meta
                    content={createPageSeo.imageHeight.toString()}
                    property="og:image:height"
                />
                <meta content={createPageSeo.imageUrl} property="og:image" />
                <meta
                    content={createPageSeo.imageUrl}
                    property="og:image:secure_url"
                />
                <meta
                    content={createPageSeo.imageType}
                    property="og:image:type"
                />
                <meta
                    content={createPageSeo.imageWidth.toString()}
                    property="og:image:width"
                />
                <meta content={siteLocale} property="og:locale" />
                <meta content={createPageSeo.title} property="og:title" />
                <meta content="website" property="og:type" />
                <meta content={createPageSeo.url} property="og:url" />
                <link href={createPageSeo.canonicalUrl} rel="canonical" />
                {createPageSeo.structuredData.map((structuredData, index) => (
                    <script key={index} type="application/ld+json">
                        {serializeStructuredData(structuredData)}
                    </script>
                ))}
            </Helmet>
            <section className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-8">
                <div className="space-y-3 text-center">
                    <h1 className="page-title" id={pageTitleId}>
                        Create a new poll
                    </h1>
                    <p className="page-lead mx-auto max-w-2xl">
                        Create a score poll, share the link, and let people
                        submit scores before you close voting.
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
                            helperText="What is this poll about?"
                            id="pollName"
                            label="Poll name"
                            maxLength={64}
                            name="pollName"
                            onChange={onFormChange}
                            required
                            value={form.pollName}
                        />
                        <PollChoiceEditor
                            choices={form.choices}
                            onAddChoice={onAddChoice}
                            onRemoveChoice={onRemoveChoice}
                        />
                        <p className="field-note">
                            The app derives the honest-majority reconstruction
                            threshold automatically from the final submitted
                            roster after voting closes.
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
                            className="w-full sm:w-auto"
                            disabled={!isFormValid || isLoading}
                            loading={isLoading}
                            loadingLabel="Creating poll"
                            size="lg"
                            type="submit"
                        >
                            Create poll
                        </LoadingButton>
                    </div>
                </form>
            </section>
        </>
    );
};

export default PollCreationPage;
