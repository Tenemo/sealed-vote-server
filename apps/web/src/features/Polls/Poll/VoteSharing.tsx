import { Check, Copy } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
    const didCopy = document.execCommand('copy');
    textArea.remove();

    if (!didCopy) {
        throw new Error('Clipboard copy failed.');
    }
};

const VoteSharing = (): React.JSX.Element => {
    const [copyStatus, setCopyStatus] = React.useState<
        'idle' | 'success' | 'error'
    >('idle');
    const resetStatusTimeoutRef = React.useRef<number | undefined>(undefined);

    const scheduleStatusReset = (): void => {
        window.clearTimeout(resetStatusTimeoutRef.current);
        resetStatusTimeoutRef.current = window.setTimeout(() => {
            setCopyStatus('idle');
        }, 2500);
    };

    React.useEffect(() => {
        return () => {
            window.clearTimeout(resetStatusTimeoutRef.current);
        };
    }, []);

    const handleCopyLink = async (): Promise<void> => {
        try {
            await copyTextToClipboard(window.location.href);
            setCopyStatus('success');
        } catch {
            setCopyStatus('error');
        }

        scheduleStatusReset();
    };

    const helperText =
        copyStatus === 'success'
            ? 'Vote link copied to clipboard.'
            : copyStatus === 'error'
              ? 'Copy failed. Please copy the link manually.'
              : 'Link to the vote to share with others';
    const tooltipText =
        copyStatus === 'success'
            ? 'Copied'
            : copyStatus === 'error'
              ? 'Copy failed'
              : 'Copy to clipboard';

    return (
        <Field>
            <FieldLabel
                className="text-sm font-medium text-muted-foreground"
                htmlFor="voteLink"
            >
                Vote link
            </FieldLabel>
            <FieldContent>
                <div className="relative">
                    <Input
                        aria-describedby="copy-page-link-helper-text"
                        className="pr-12"
                        id="voteLink"
                        readOnly
                        value={window.location.href}
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                aria-label={
                                    copyStatus === 'success'
                                        ? 'Vote link copied'
                                        : 'Copy vote link'
                                }
                                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                                onClick={() => {
                                    void handleCopyLink();
                                }}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                            >
                                {copyStatus === 'success' ? (
                                    <Check
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                ) : (
                                    <Copy
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tooltipText}</TooltipContent>
                    </Tooltip>
                </div>
                <FieldDescription
                    aria-live="polite"
                    className={cn(
                        'mt-2 text-sm leading-6',
                        copyStatus === 'error' && 'text-destructive',
                        copyStatus === 'success' && 'text-foreground',
                    )}
                    id="copy-page-link-helper-text"
                >
                    {helperText}
                </FieldDescription>
            </FieldContent>
        </Field>
    );
};

export default VoteSharing;
