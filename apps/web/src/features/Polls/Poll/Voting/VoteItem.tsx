import { ListItem, Button, Typography, Box } from '@mui/material';
import React from 'react';

type Props = {
    choiceName: string;
    onVote: (choiceName: string, score: number) => void;
    selectedScore: number;
};

const SCORE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const VoteItem = ({
    choiceName,
    onVote,
    selectedScore,
}: Props): React.JSX.Element => {
    return (
        <ListItem
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                mb: 3,
            }}
        >
            <Typography sx={{ display: 'block' }} variant="h6">
                {choiceName}
            </Typography>
            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                }}
            >
                {SCORE_CHOICES.map((scoreChoice) => (
                    <Button
                        key={scoreChoice}
                        onClick={() => onVote(choiceName, scoreChoice)}
                        sx={{ m: 1, padding: '3px 5px', textTransform: 'none' }}
                        variant={
                            scoreChoice === selectedScore
                                ? 'contained'
                                : 'outlined'
                        }
                    >
                        {scoreChoice === 1 ? 'Abstain' : scoreChoice}
                    </Button>
                ))}
            </Box>
        </ListItem>
    );
};

export default VoteItem;
