import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import {
    useTheme,
    Grid,
    Box,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    IconButton,
    Typography,
} from '@mui/material';
import React, { useState, ChangeEvent, KeyboardEvent } from 'react';

type ChoiceAddingProps = {
    choices: string[];
    onAddChoice: (choice: string) => void;
    onRemoveChoice: (choice: string) => void;
};

const ChoiceAdding = ({
    choices,
    onAddChoice,
    onRemoveChoice,
}: ChoiceAddingProps): React.JSX.Element => {
    const theme = useTheme();
    const [choiceName, setChoiceName] = useState('');

    const handleAddChoice = (): void => {
        if (!choiceName.trim()) return;
        onAddChoice(choiceName);
        setChoiceName('');
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
        setChoiceName(event.target.value);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter') handleAddChoice();
    };

    const isChoiceDuplicate = choices.includes(choiceName);
    const isChoiceNameValid = !!choiceName.trim() && !isChoiceDuplicate;

    return (
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
                sx={{
                    width: '100%',
                    p: 1,
                    backgroundColor: theme.palette.action.hover,
                    borderRadius: 1,
                }}
                xl={4}
            >
                <Box
                    sx={{
                        display: 'flex',
                        minHeight: 100,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <TextField
                        autoComplete="off"
                        error={isChoiceDuplicate}
                        helperText={
                            isChoiceDuplicate
                                ? 'This choice already exists'
                                : undefined
                        }
                        id="choiceName"
                        inputProps={{ maxLength: 64 }}
                        label="Choice to vote for"
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        sx={{ m: 1, alignSelf: 'flex-start' }}
                        value={choiceName}
                    />
                    <Button
                        disabled={!isChoiceNameValid}
                        onClick={handleAddChoice}
                        startIcon={<AddIcon />}
                        sx={{ m: 1, mb: 2 }}
                        variant="outlined"
                    >
                        Add new choice
                    </Button>
                </Box>
                {choices.length === 0 && (
                    <Typography sx={{ m: 1 }} variant="body1">
                        To create a vote, add choices that each participant will
                        be able to rank from 1 to 10.
                    </Typography>
                )}
                {!!choices.length && (
                    <>
                        <Typography sx={{ m: 1 }} variant="body1">
                            Choices currently in the vote:
                        </Typography>
                        <List sx={{ px: 2, py: 1 }}>
                            {choices.map((choice) => (
                                <ListItem
                                    key={choice}
                                    secondaryAction={
                                        <IconButton
                                            aria-label="delete"
                                            edge="end"
                                            onClick={() =>
                                                onRemoveChoice(choice)
                                            }
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    }
                                    sx={{
                                        border: `1px solid ${theme.palette.secondary.main}`,
                                        borderRadius: 1,
                                        my: 1,
                                    }}
                                >
                                    <ListItemText primary={choice} />
                                </ListItem>
                            ))}
                        </List>
                    </>
                )}
                {choices.length === 1 && (
                    <Typography sx={{ m: 1 }} variant="body1">
                        There need to be at least two possible choices in a
                        vote.
                    </Typography>
                )}
            </Grid>
        </Grid>
    );
};

export default ChoiceAdding;
