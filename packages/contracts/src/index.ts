export type EncryptedMessage = {
    c1: string;
    c2: string;
};

export type MessageResponse = {
    message: string;
};

export type CreatePollRequest = {
    choices: string[];
    pollName: string;
    maxParticipants?: number;
};

export type CreatePollResponse = {
    pollName: string;
    creatorToken: string;
    choices: string[];
    maxParticipants: number;
    id: string;
    createdAt: string;
    publicKeyShares: string[];
    commonPublicKey: string | null;
    encryptedVotes: EncryptedMessage[][];
    encryptedTallies: EncryptedMessage[];
    decryptionShares: string[][];
    results: number[];
};

export type PollResponse = {
    pollName: string;
    createdAt: string;
    choices: string[];
    voters: string[];
    isOpen: boolean;
    publicKeyShares: string[];
    commonPublicKey: string | null;
    encryptedVotes: EncryptedMessage[][];
    encryptedTallies: EncryptedMessage[];
    decryptionShares: string[][];
    results: number[];
};

export type RegisterVoterRequest = {
    voterName: string;
};

export type RegisterVoterResponse = {
    message: string;
    voterIndex: number;
    voterName: string;
    pollId: string;
    voterToken: string;
};

export type ClosePollRequest = {
    creatorToken: string;
};

export type PublicKeyShareRequest = {
    publicKeyShare: string;
    voterToken: string;
};

export type VoteRequest = {
    votes: EncryptedMessage[];
    voterToken: string;
};

export type VoteResponse = string;

export type DecryptionSharesRequest = {
    decryptionShares: string[];
    voterToken: string;
};

export const API_PREFIX = '/api';

export const POLL_ROUTES = {
    create: `${API_PREFIX}/polls/create`,
    poll: (pollId: string): string => `${API_PREFIX}/polls/${pollId}`,
    register: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/register`,
    close: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/close`,
    publicKeyShare: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/public-key-share`,
    vote: (pollId: string): string => `${API_PREFIX}/polls/${pollId}/vote`,
    decryptionShares: (pollId: string): string =>
        `${API_PREFIX}/polls/${pollId}/decryption-shares`,
    remove: (pollId: string): string => `${API_PREFIX}/polls/${pollId}`,
} as const;

export const ERROR_MESSAGES = {
    invalidPollId: 'Invalid poll ID',
    duplicatePollName: 'Vote with that name already exists.',
    duplicateVoterName: 'Voter name is already taken for this vote.',
    pollClosed: 'Poll is closed for new registrations.',
    pollAlreadyClosed: 'Poll is already closed.',
    notEnoughVotersToClose: 'Not enough voters to close the poll.',
    invalidVoterToken: 'Invalid voter token.',
    publicKeyAlreadySubmitted: 'Public key share has already been submitted.',
    voteAlreadySubmitted: 'Vote has already been submitted.',
    decryptionSharesAlreadySubmitted:
        'Decryption shares have already been submitted.',
    publicKeyPhaseClosed:
        'Public key shares can only be submitted during key generation.',
    votingPhaseClosed: 'Votes can only be submitted during voting.',
    decryptionPhaseClosed:
        'Decryption shares can only be submitted during decryption.',
    voteVectorLengthMismatch:
        'Vote vector length must match the number of poll choices.',
    decryptionVectorLengthMismatch:
        'Decryption share vector length must match the number of encrypted tallies.',
    maxParticipantsReached:
        'Poll has reached its maximum number of participants.',
} as const;
