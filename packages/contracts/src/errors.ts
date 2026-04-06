export type MessageResponse = {
    message: string;
};

export const ERROR_MESSAGES = {
    invalidPollId: 'Invalid poll ID',
    duplicatePollName: 'Vote with that name already exists.',
    duplicateVoterName: 'Voter name is already taken for this vote.',
    pollClosed: 'Poll is closed for new registrations.',
    pollAlreadyClosed: 'Poll is already closed.',
    notEnoughVotersToClose: 'Not enough voters to close the poll.',
    invalidCreatorToken: 'Invalid creator token.',
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
