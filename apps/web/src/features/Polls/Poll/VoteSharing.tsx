import { Check, Copy, Share2 } from 'lucide-react';
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

const isAbortError = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError';

type VoteSharingProps = {
    pollTitle: string;
};

const VoteSharing = ({ pollTitle }: VoteSharingProps): React.JSX.Element => {
    const [shareStatus, setShareStatus] = React.useState<
        'idle' | 'copy-success' | 'copy-error' | 'share-success' | 'share-error'
    >('idle');
    const resetStatusTimeoutRef = React.useRef<number | undefined>(undefined);
    const supportsNativeShare =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function';
    const voteUrl = window.location.href;

    const scheduleStatusReset = (): void => {
        window.clearTimeout(resetStatusTimeoutRef.current);
        resetStatusTimeoutRef.current = window.setTimeout(() => {
            setShareStatus('idle');
        }, 2500);
    };

    React.useEffect(() => {
        return () => {
            window.clearTimeout(resetStatusTimeoutRef.current);
        };
    }, []);

    const handleCopyLink = async (): Promise<void> => {
        try {
            await copyTextToClipboard(voteUrl);
            setShareStatus('copy-success');
        } catch {
            setShareStatus('copy-error');
        }

        scheduleStatusReset();
    };

    const handleShareLink = async (): Promise<void> => {
        if (!supportsNativeShare) {
            return;
        }

        try {
            await navigator.share({
                title: pollTitle,
                text: pollTitle,
                url: voteUrl,
            });
            setShareStatus('share-success');
            scheduleStatusReset();
        } catch (error) {
            if (isAbortError(error)) {
                setShareStatus('idle');
                return;
            }

            setShareStatus('share-error');
            scheduleStatusReset();
        }
    };

    const helperText =
        shareStatus === 'copy-success'
            ? 'Vote link copied to clipboard.'
            : shareStatus === 'copy-error'
              ? 'Copy failed. Please copy the link manually.'
              : shareStatus === 'share-success'
                ? 'Vote link shared.'
                : shareStatus === 'share-error'
                  ? 'Share failed. Please use copy instead.'
                  : 'Link to the vote to share with others';
    const copyTooltipText =
        shareStatus === 'copy-success'
            ? 'Copied'
            : shareStatus === 'copy-error'
              ? 'Copy failed'
              : 'Copy to clipboard';
    const shareTooltipText =
        shareStatus === 'share-success'
            ? 'Shared'
            : shareStatus === 'share-error'
              ? 'Share failed'
              : 'Share link';

    return (
        <Field>
            <FieldLabel
                className="text-sm font-medium text-foreground"
                htmlFor="voteLink"
            >
                Share vote link
            </FieldLabel>
            <FieldContent>
                <div className="relative">
                    <Input
                        aria-describedby="copy-page-link-helper-text"
                        className={supportsNativeShare ? 'pr-24' : 'pr-12'}
                        id="voteLink"
                        readOnly
                        value={voteUrl}
                        variant="filled"
                    />
                    <div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-1">
                        {supportsNativeShare && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        aria-label={
                                            shareStatus === 'share-success'
                                                ? 'Vote link shared'
                                                : 'Share vote link'
                                        }
                                        onClick={() => {
                                            void handleShareLink();
                                        }}
                                        size="icon-sm"
                                        title="Share link"
                                        type="button"
                                        variant="ghost"
                                    >
                                        {shareStatus === 'share-success' ? (
                                            <Check
                                                aria-hidden="true"
                                                className="size-4"
                                            />
                                        ) : (
                                            <Share2
                                                aria-hidden="true"
                                                className="size-4"
                                            />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {shareTooltipText}
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    aria-label={
                                        shareStatus === 'copy-success'
                                            ? 'Vote link copied'
                                            : 'Copy vote link'
                                    }
                                    onClick={() => {
                                        void handleCopyLink();
                                    }}
                                    size="icon-sm"
                                    title="Copy to clipboard"
                                    type="button"
                                    variant="ghost"
                                >
                                    {shareStatus === 'copy-success' ? (
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
                            <TooltipContent>{copyTooltipText}</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
                <FieldDescription
                    aria-live="polite"
                    className={cn(
                        'mt-0',
                        (shareStatus === 'copy-error' ||
                            shareStatus === 'share-error') &&
                            'text-destructive',
                        (shareStatus === 'copy-success' ||
                            shareStatus === 'share-success') &&
                            'text-foreground',
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
