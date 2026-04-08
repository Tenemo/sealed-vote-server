import type { EncryptedMessage } from './vote.js';

export type CreatePollRequest = {
    choices: string[];
    creatorToken: string;
    pollName: string;
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
    publishedDecryptionShares: string[][];
    resultTallies: string[];
    resultScores: number[];
};

export type RegisterVoterRequest = {
    voterName: string;
    voterToken: string;
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

export type RecoverSessionRequest =
    | {
          creatorToken: string;
          voterToken?: never;
      }
    | {
          creatorToken?: never;
          voterToken: string;
      };

export type RecoverSessionResponse = {
    role: 'creator' | 'voter';
    pollId: string;
    pollSlug: string;
    phase:
        | 'registration'
        | 'key-generation'
        | 'voting'
        | 'tallying'
        | 'decryption'
        | 'complete';
    isOpen: boolean;
    voterName: string | null;
    voterIndex: number | null;
    hasSubmittedPublicKeyShare: boolean;
    hasSubmittedVote: boolean;
    hasSubmittedDecryptionShares: boolean;
    resultsAvailable: boolean;
};
