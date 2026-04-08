import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

const connectionErrorStatuses = new Set(['FETCH_ERROR', 'TIMEOUT_ERROR']);

export const isFetchBaseQueryError = (
    error: unknown,
): error is FetchBaseQueryError =>
    !!error && typeof error === 'object' && 'status' in error;

export const isConnectionError = (
    error: unknown,
): error is FetchBaseQueryError =>
    isFetchBaseQueryError(error) &&
    typeof error.status === 'string' &&
    connectionErrorStatuses.has(error.status);

export const renderError = (
    error: FetchBaseQueryError | SerializedError | undefined,
): string => {
    if (!error) return 'An unknown error occurred.';
    if (typeof error === 'string') return error;
    if (isConnectionError(error)) {
        return 'The connection to the server was lost.';
    }
    if ('data' in error) {
        if (typeof error.data === 'string') return error.data;
        const data = error.data as Record<string, unknown>;
        if (typeof data.message === 'string') return data.message;
    }
    if ('error' in error && typeof error.error === 'string') {
        if (/failed to fetch/i.test(error.error)) {
            return 'The connection to the server was lost.';
        }

        return error.error;
    }
    if ('message' in error && typeof error.message === 'string') {
        if (/failed to fetch/i.test(error.message)) {
            return 'The connection to the server was lost.';
        }

        return error.message;
    }

    return 'An unknown error occurred.';
};
