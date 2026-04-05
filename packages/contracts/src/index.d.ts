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
export declare const API_PREFIX = "/api";
export declare const POLL_ROUTES: {
    readonly create: "/api/polls/create";
    readonly poll: (pollId: string) => string;
    readonly register: (pollId: string) => string;
    readonly close: (pollId: string) => string;
    readonly publicKeyShare: (pollId: string) => string;
    readonly vote: (pollId: string) => string;
    readonly decryptionShares: (pollId: string) => string;
    readonly remove: (pollId: string) => string;
};
export declare const ERROR_MESSAGES: {
    readonly invalidPollId: "Invalid poll ID";
    readonly duplicatePollName: "Vote with that name already exists.";
    readonly duplicateVoterName: "Voter name is already taken for this vote.";
    readonly pollClosed: "Poll is closed for new registrations.";
    readonly pollAlreadyClosed: "Poll is already closed.";
    readonly notEnoughVotersToClose: "Not enough voters to close the poll.";
    readonly invalidVoterToken: "Invalid voter token.";
    readonly publicKeyAlreadySubmitted: "Public key share has already been submitted.";
    readonly voteAlreadySubmitted: "Vote has already been submitted.";
    readonly decryptionSharesAlreadySubmitted: "Decryption shares have already been submitted.";
    readonly publicKeyPhaseClosed: "Public key shares can only be submitted during key generation.";
    readonly votingPhaseClosed: "Votes can only be submitted during voting.";
    readonly decryptionPhaseClosed: "Decryption shares can only be submitted during decryption.";
    readonly voteVectorLengthMismatch: "Vote vector length must match the number of poll choices.";
    readonly decryptionVectorLengthMismatch: "Decryption share vector length must match the number of encrypted tallies.";
    readonly maxParticipantsReached: "Poll has reached its maximum number of participants.";
};
