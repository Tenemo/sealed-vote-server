export const API_PREFIX = '/api';

export const POLL_ROUTES = {
    create: `${API_PREFIX}/polls/create`,
    poll: (pollRef: string): string => `${API_PREFIX}/polls/${pollRef}`,
    register: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/register`,
    recoverSession: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/recover-session`,
    close: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/close`,
    restartCeremony: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/restart-ceremony`,
    boardMessages: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/board/messages`,
    remove: (pollId: string): string => `${API_PREFIX}/polls/${pollId}`,
} as const;
