import { ContentCopy as CopyIcon } from '@mui/icons-material';
import {
    Box,
    FormControl,
    FormHelperText,
    IconButton,
    InputAdornment,
    OutlinedInput,
    Tooltip,
} from '@mui/material';
import React from 'react';

const copyTextToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';

    document.body.append(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
};

const VoteSharing = (): React.JSX.Element => {
    const handleCopyLink = (): void => {
        void copyTextToClipboard(window.location.href);
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
            }}
        >
            <Box sx={{ width: '100%', maxWidth: 720, p: 2 }}>
                <FormControl
                    fullWidth
                    sx={{
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
                        sx={{
                            '& .MuiOutlinedInput-input': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            },
                        }}
                        value={window.location.href}
                    />
                    <FormHelperText
                        id="copy-page-link-helper-text"
                        sx={{ mt: 1, textAlign: 'center' }}
                    >
                        Link to the vote to share with others
                    </FormHelperText>
                </FormControl>
            </Box>
        </Box>
    );
};

export default VoteSharing;
