import { Button, TextField, Box, List, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';

import VoteItem from './VoteItem';

import { canRegister } from '@sealed-vote/protocol';
import { useAppSelector } from 'app/hooks';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

type VotingProps = {
    choices: string[];
    onVote: (voterName: string, selectedScores: Record<string, number>) => void;
    pollId: string;
};

const Voting = ({
    choices,
    onVote,
    pollId,
}: VotingProps): React.JSX.Element => {
    const [selectedScores, setSelectedScoresForm] = useState<
        Record<string, number>
    >(choices.reduce((acc, choiceName) => ({ ...acc, [choiceName]: 1 }), {}));
    const { progressMessage, voterName: persistedVoterName } = useAppSelector(
        (state) => selectVotingStateByPollId(state, pollId),
    );
    const [voterName, setVoterName] = useState(persistedVoterName ?? '');

    useEffect(() => {
        if (persistedVoterName) {
            setVoterName(persistedVoterName);
        }
    }, [persistedVoterName]);

    const onVoteSelect = (choiceName: string, score: number): void => {
        setSelectedScoresForm({ ...selectedScores, [choiceName]: score });
    };

    const onSubmit = (): void => {
        void onVote(voterName.trim(), selectedScores);
    };

    const { data: poll } = useGetPollQuery(pollId);

    if (!!progressMessage || !poll || !canRegister(poll)) {
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
                {choices.map((choiceName) => (
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
