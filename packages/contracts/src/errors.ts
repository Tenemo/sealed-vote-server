export type MessageResponse = {
    message: string;
};

export const ERROR_MESSAGES = {
    invalidPollId: 'Invalid poll ID',
    duplicateVoterName: 'Voter name is already taken for this vote.',
    pollClosed: 'Poll is closed for new registrations.',
    pollAlreadyClosed: 'Poll is already closed.',
    notEnoughVotersToClose: 'Not enough voters to close the poll.',
    invalidCreatorToken: 'Invalid creator token.',
    invalidVoterToken: 'Invalid voter token.',
    creatorTokenConflict:
        'Creator token was already used for a different vote.',
    voterTokenConflict:
        'Voter token was already used for a different voter name.',
    publicKeyAlreadySubmitted: 'Public key share has already been submitted.',
    publicKeyConflict:
        'A different public key share has already been submitted.',
    voteAlreadySubmitted: 'Vote has already been submitted.',
    voteConflict: 'A different vote has already been submitted.',
    decryptionSharesAlreadySubmitted:
        'Decryption shares have already been submitted.',
    decryptionSharesConflict:
        'Different decryption shares have already been submitted.',
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
    recoverSessionTokenRequired: 'Exactly one recovery token must be provided.',
} as const;
