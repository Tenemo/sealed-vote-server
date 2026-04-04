import type { EncryptedMessage } from './vote.js';

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
