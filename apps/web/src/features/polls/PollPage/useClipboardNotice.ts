import React from 'react';

export const useClipboardNotice = (
    valueToCopy: string,
): {
    canCopy: boolean;
    copyNotice: string | null;
    onCopy: () => Promise<void>;
} => {
    const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
    const canCopy =
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function';

    React.useEffect(() => {
        if (!copyNotice || typeof window.setTimeout !== 'function') {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setCopyNotice(null);
        }, 2_000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [copyNotice]);

    const onCopy = React.useCallback(async (): Promise<void> => {
        if (!canCopy) {
            return;
        }

        try {
            await navigator.clipboard.writeText(valueToCopy);
            setCopyNotice('Link copied.');
        } catch {
            setCopyNotice('Copy failed.');
        }
    }, [canCopy, valueToCopy]);

    return {
        canCopy,
        copyNotice,
        onCopy,
    };
};
