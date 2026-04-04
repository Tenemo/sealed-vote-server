import {
    Typography,
    Button,
    TextField,
    Alert,
    CircularProgress,
    Grid,
} from '@mui/material';
import React, { useState, ChangeEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import ChoiceAdding from './ChoiceAdding';

import { useCreatePollMutation } from 'features/Polls/pollsApi';
import { renderError } from 'utils/utils';

type Form = {
    pollName: string;
    choices: string[];
};

const initialForm = {
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
            choices: prev.choices.filter((c) => c !== choice),
        }));

    const onCreatePoll = (): void => {
        void createPoll({
            pollName: form.pollName,
            choices: form.choices,
            // @ts-expect-error
        }).then(({ data: { id } }) => {
            navigate(`/votes/${id}`);
        });
    };

    const isFormValid = pollName.trim() && choices.length > 1 && !isLoading;

    return (
        <>
            <Helmet>
                <title>Vote creation</title>
            </Helmet>
            <Typography
                sx={{
                    mb: 2,
                    mt: 4,
                }}
                variant="h5"
            >
                Create a new vote
            </Typography>
            <Grid
                container
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                <Grid
                    item
                    lg={6}
                    md={8}
                    sm={10}
                    sx={{ width: '100%', p: 1 }}
                    xl={4}
                >
                    <TextField
                        autoComplete="off"
                        helperText={
                            pollName ? '' : 'What would you like to vote on?'
                        }
                        id="pollName"
                        inputProps={{ maxLength: 64 }}
                        label="Vote name"
                        name="pollName"
                        onChange={onFormChange}
                        required
                        sx={{ mb: 1, minHeight: 80, width: '100%' }}
                        value={pollName}
                    />
                </Grid>
            </Grid>
            <ChoiceAdding
                choices={form.choices}
                onAddChoice={onAddChoice}
                onRemoveChoice={onRemoveChoice}
            />
            <Button
                disabled={!isFormValid}
                onClick={onCreatePoll}
                size="large"
                sx={{ m: 2 }}
                variant="contained"
            >
                Create vote
            </Button>
            {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {renderError(error)}
                </Alert>
            )}
            {isLoading && <CircularProgress sx={{ mt: 2 }} />}
        </>
    );
};

export default PollCreationPage;
