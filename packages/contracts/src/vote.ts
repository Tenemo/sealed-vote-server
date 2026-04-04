export type EncryptedMessage = {
    c1: string;
    c2: string;
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
