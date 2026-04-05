import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

export const renderError = (
    error: FetchBaseQueryError | SerializedError | undefined,
): string => {
    if (!error) return 'An unknown error occurred';
    if (typeof error === 'string') return error;
    if ('data' in error) {
        if (typeof error.data === 'string') return error.data;
        const data = error.data as Record<string, unknown>;
        if (typeof data.message === 'string') return data.message;
    }
    if ('error' in error && typeof error.error === 'string') return error.error;
    return 'An unknown error occurred';
};
