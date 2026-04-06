export const API_PREFIX = '/api';

export const POLL_ROUTES = {
    create: `${API_PREFIX}/polls/create`,
    poll: (pollRef: string): string => `${API_PREFIX}/polls/${pollRef}`,
    register: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/register`,
    close: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/close`,
    publicKeyShare: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/public-key-share`,
    vote: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/vote`,
    decryptionShares: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/decryption-shares`,
    remove: (pollId: string): string => `${API_PREFIX}/polls/${pollId}`,
} as const;
