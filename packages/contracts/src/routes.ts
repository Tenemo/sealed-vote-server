export const API_PREFIX = '/api';

export const POLL_ROUTES = {
    createPoll: `${API_PREFIX}/polls/create`,
    fetchPoll: (pollReference: string): string =>
        `${API_PREFIX}/polls/${pollReference}`,
    registerVoter: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/register`,
    closeVoting: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/close`,
    restartCeremony: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/restart-ceremony`,
    boardMessages: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/board/messages`,
    deletePoll: (pollId: string): string => `${API_PREFIX}/polls/${pollId}`,
} as const;
