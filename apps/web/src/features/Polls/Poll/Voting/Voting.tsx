import { Button, TextField, Box, List, Typography } from '@mui/material';
import { canRegister } from '@sealed-vote/protocol';
import React, { useEffect, useState } from 'react';

import VoteItem from './VoteItem';

import { useAppSelector } from 'app/hooks';
import { type PollResponse } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

const buildDefaultScores = (choices: string[]): Record<string, number> =>
    Object.fromEntries(choices.map((choiceName) => [choiceName, 1]));

type VotingProps = {
    onVote: (voterName: string, selectedScores: Record<string, number>) => void;
    poll: PollResponse;
    pollId: string;
};

const Voting = ({ onVote, poll, pollId }: VotingProps): React.JSX.Element => {
    const [selectedScores, setSelectedScoresForm] = useState<
        Record<string, number>
    >(buildDefaultScores(poll.choices));
    const {
        progressMessage,
        selectedScores: persistedSelectedScores,
        voterName: persistedVoterName,
    } = useAppSelector((state) => selectVotingStateByPollId(state, pollId));
    const [voterName, setVoterName] = useState(persistedVoterName ?? '');

    useEffect(() => {
        if (persistedVoterName) {
            setVoterName(persistedVoterName);
        }
    }, [persistedVoterName]);

    useEffect(() => {
        setSelectedScoresForm((currentScores) => {
            if (persistedSelectedScores) {
                return persistedSelectedScores;
            }

            const nextScores = buildDefaultScores(poll.choices);
            return Object.keys(currentScores).length
                ? currentScores
                : nextScores;
        });
    }, [persistedSelectedScores, poll.choices]);

    const onVoteSelect = (choiceName: string, score: number): void => {
        setSelectedScoresForm((currentScores) => ({
            ...currentScores,
            [choiceName]: score,
        }));
    };

    const onSubmit = (): void => {
        void onVote(voterName.trim(), selectedScores);
    };

    if (progressMessage || !canRegister(poll)) {
        return <></>;
    }

    const normalizedVoterName = voterName.trim();
    const isVoterNameDuplicate =
        !!normalizedVoterName &&
        poll.voters.includes(normalizedVoterName) &&
        normalizedVoterName !== persistedVoterName;

    const isSubmitEnabled =
        !!Object.keys(selectedScores).length &&
        !!normalizedVoterName &&
        !isVoterNameDuplicate;

    return (
        <>
            <Typography
                sx={{ py: 1, px: 2, textAlign: 'center' }}
                variant="body1"
            >
                Rate choices from 1 to 10. The results will be ranked by
                geometric mean of all votes per item. All voters need to be
                present in order to complete the vote.
            </Typography>
            <List>
                {poll.choices.map((choiceName) => (
                    <VoteItem
                        choiceName={choiceName}
                        key={choiceName}
                        onVote={onVoteSelect}
                        selectedScore={selectedScores[choiceName]}
                    />
                ))}
            </List>
            <Box
                sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}
            >
                <TextField
                    error={isVoterNameDuplicate}
                    helperText={
                        isVoterNameDuplicate
                            ? 'This voter name already exists'
                            : undefined
                    }
                    id="voterName"
                    inputProps={{ maxLength: 32 }}
                    label="Voter name*"
                    name="voterName"
                    onChange={({ target: { value } }) => setVoterName(value)}
                    sx={{ m: 2 }}
                    value={voterName}
                />
                <Button
                    disabled={!isSubmitEnabled}
                    onClick={onSubmit}
                    size="large"
                    sx={{ m: 2 }}
                    variant="contained"
                >
                    Vote
                </Button>
            </Box>
        </>
    );
};

export default Voting;
