import {
    EmojiEvents as CupIcon,
    MilitaryTech as MedalIcon,
} from '@mui/icons-material';
import {
    useTheme,
    ListItemText,
    ListItem,
    ListItemIcon,
    List,
    Typography,
    Box,
} from '@mui/material';
import React from 'react';
import { useParams } from 'react-router-dom';

import { computeGeometricMean } from '@sealed-vote/protocol';
import { useAppSelector } from 'app/hooks';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

const VoteResults = (): React.JSX.Element => {
    const { pollId } = useParams();
    const { results } = useAppSelector((state) =>
        selectVotingStateByPollId(state, pollId ?? ''),
    );
    if (!pollId) {
        throw new Error('Poll ID missing.');
    }
    const { data: poll } = useGetPollQuery(pollId);
    const theme = useTheme();

    const displayedResults =
        results ?? (poll?.results.length ? poll.results : null);

    if (!displayedResults || !poll) {
        return <></>;
    }

    const geometricMeans = computeGeometricMean(
        displayedResults,
        poll.voters.length,
    );
    const sortedResults = poll.choices
        .map(
            (choiceName, index) => [choiceName, geometricMeans[index]] as const,
        )
        .sort((a, b) => b[1] - a[1])
        .map(([choiceName, score]) => [choiceName, score.toFixed(2)]);
    return (
        <Box
            sx={{
                backgroundColor: theme.palette.action.hover,
                borderRadius: 1,
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}
        >
            <Typography sx={{ py: 1, px: 2 }} variant="h5">
                Results
            </Typography>
            <List>
                {sortedResults.map(([choiceName, score], index) => (
                    <ListItem key={choiceName}>
                        <ListItemIcon>
                            {index === 0 && <CupIcon />}
                            {(index === 1 || index === 2) && <MedalIcon />}
                        </ListItemIcon>
                        <ListItemText
                            primary={choiceName}
                            secondary={`Score: ${score}`}
                        />
                    </ListItem>
                ))}
            </List>
        </Box>
    );
};

export default VoteResults;
