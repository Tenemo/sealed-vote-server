import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

const connectionErrorStatuses = new Set(['FETCH_ERROR', 'TIMEOUT_ERROR']);
const connectionErrorHttpStatuses = new Set([502, 503, 504]);
const connectionErrorPattern =
    /failed to fetch|fetch_error|timeout_error|connection to the server was lost/i;

export const connectionLostMessage = 'The connection to the server was lost.';
export const reconnectingWorkflowMessage =
    'Connection lost. Reconnecting and resuming in the background...';

export const isFetchBaseQueryError = (
    error: unknown,
): error is FetchBaseQueryError =>
    !!error && typeof error === 'object' && 'status' in error;

export const isConnectionError = (
    error: unknown,
): error is FetchBaseQueryError =>
    isFetchBaseQueryError(error) &&
    ((typeof error.status === 'string' &&
        connectionErrorStatuses.has(error.status)) ||
        (typeof error.status === 'number' &&
            connectionErrorHttpStatuses.has(error.status)));

export const isConnectionErrorMessage = (message: string): boolean =>
    connectionErrorPattern.test(message);

export const renderError = (
    error: FetchBaseQueryError | SerializedError | undefined,
): string => {
    if (!error) return 'An unknown error occurred.';
    if (isConnectionError(error)) {
        return connectionLostMessage;
    }
    if ('data' in error) {
        if (typeof error.data === 'string') return error.data;
        if (error.data && typeof error.data === 'object') {
            const data = error.data as Record<string, unknown>;
            if (typeof data.message === 'string') return data.message;
        }
    }
    if ('error' in error && typeof error.error === 'string') {
        if (isConnectionErrorMessage(error.error)) {
            return connectionLostMessage;
        }

        return error.error;
    }
    if ('message' in error && typeof error.message === 'string') {
        if (isConnectionErrorMessage(error.message)) {
            return connectionLostMessage;
        }

        return error.message;
    }

    return 'An unknown error occurred.';
};
