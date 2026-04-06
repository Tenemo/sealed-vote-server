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
import { computeGeometricMean } from '@sealed-vote/protocol';
import React from 'react';

import { useAppSelector } from 'app/hooks';
import { type PollResponse } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

type VoteResultsProps = {
    poll: PollResponse;
    pollId: string;
};

const VoteResults = ({ poll, pollId }: VoteResultsProps): React.JSX.Element => {
    const { results } = useAppSelector((state) =>
        selectVotingStateByPollId(state, pollId),
    );
    const theme = useTheme();

    const displayedResults =
        results ?? (poll.results.length ? poll.results : null);

    if (!displayedResults) {
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
