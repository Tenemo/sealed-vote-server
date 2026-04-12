import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

const connectionErrorStatuses = new Set(['FETCH_ERROR', 'TIMEOUT_ERROR']);
const connectionErrorHttpStatuses = new Set([502, 503, 504]);
const connectionErrorPattern =
    /failed to fetch|fetch_error|timeout_error|connection to the server was lost/i;

export const connectionLostMessage = 'The connection to the server was lost.';
export const reconnectingWorkflowMessage =
    'Connection lost. Reconnecting and resuming in the background...';

const isFetchBaseQueryError = (error: unknown): error is FetchBaseQueryError =>
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

export const renderError = (error: unknown): string => {
    if (!error) return 'An unknown error occurred.';
    if (isConnectionError(error)) {
        return connectionLostMessage;
    }

    if (typeof error === 'object' && error !== null && 'data' in error) {
        const dataField = (error as { data?: unknown }).data;

        if (typeof dataField === 'string') return dataField;
        if (dataField && typeof dataField === 'object') {
            const data = dataField as Record<string, unknown>;
            if (typeof data.message === 'string') return data.message;
        }
    }

    if (typeof error === 'object' && error !== null && 'error' in error) {
        const errorField = (error as { error?: unknown }).error;

        if (typeof errorField === 'string') {
            if (isConnectionErrorMessage(errorField)) {
                return connectionLostMessage;
            }

            return errorField;
        }
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        const messageField = (error as { message?: unknown }).message;

        if (typeof messageField === 'string') {
            if (isConnectionErrorMessage(messageField)) {
                return connectionLostMessage;
            }

            return messageField;
        }
    }

    if (typeof error === 'string') {
        if (isConnectionErrorMessage(error)) {
            return connectionLostMessage;
        }

        return error;
    }

    return 'An unknown error occurred.';
};
