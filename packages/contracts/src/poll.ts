import type { EncryptedMessage } from './vote.js';

export type CreatePollRequest = {
    choices: string[];
    pollName: string;
    maxParticipants?: number;
};

export type CreatePollResponse = {
    id: string;
    slug: string;
    creatorToken: string;
};

export type PollResponse = {
    id: string;
    slug: string;
    pollName: string;
    createdAt: string;
    choices: string[];
    voters: string[];
    isOpen: boolean;
    publicKeyShareCount: number;
    encryptedVoteCount: number;
    decryptionShareCount: number;
    commonPublicKey: string | null;
    encryptedTallies: EncryptedMessage[];
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
