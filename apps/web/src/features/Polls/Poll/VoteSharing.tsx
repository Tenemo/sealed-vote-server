import { ContentCopy as CopyIcon } from '@mui/icons-material';
import {
    FormControl,
    FormHelperText,
    Grid,
    IconButton,
    InputAdornment,
    OutlinedInput,
    Tooltip,
} from '@mui/material';
import copy from 'copy-to-clipboard';
import React from 'react';

const VoteSharing = (): React.JSX.Element => {
    const handleCopyLink = (): void => {
        copy(window.location.href);
    };

    return (
        <Grid
            container
            sx={{
                display: 'flex',
                justifyContent: 'center',
            }}
        >
            <Grid
                size={{ sm: 10, md: 8, lg: 6, xl: 4 }}
                sx={{ width: '100%', p: 2 }}
            >
                <FormControl
                    sx={{
                        alignSelf: 'flex-start',
                        width: '100%',
                    }}
                    variant="filled"
                >
                    <OutlinedInput
                        aria-describedby="copy-page-link-helper-text"
                        endAdornment={
                            <InputAdornment position="end">
                                <Tooltip title="Copy to clipboard">
                                    <IconButton
                                        aria-label="Copy vote link"
                                        edge="end"
                                        onClick={handleCopyLink}
                                    >
                                        <CopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </InputAdornment>
                        }
                        readOnly
                        size="small"
                        value={window.location.href}
                    />
                    <FormHelperText id="copy-page-link-helper-text">
                        Link to the vote to share with others
                    </FormHelperText>
                </FormControl>
            </Grid>
        </Grid>
    );
};

export default VoteSharing;
