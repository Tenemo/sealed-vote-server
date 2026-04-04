export const API_PREFIX = '/api';
export const POLL_ROUTES = {
    create: `${API_PREFIX}/polls/create`,
    poll: (pollId) => `${API_PREFIX}/polls/${pollId}`,
    register: (pollId) => `${API_PREFIX}/polls/${pollId}/register`,
    close: (pollId) => `${API_PREFIX}/polls/${pollId}/close`,
    publicKeyShare: (pollId) => `${API_PREFIX}/polls/${pollId}/public-key-share`,
    vote: (pollId) => `${API_PREFIX}/polls/${pollId}/vote`,
    decryptionShares: (pollId) => `${API_PREFIX}/polls/${pollId}/decryption-shares`,
    remove: (pollId) => `${API_PREFIX}/polls/${pollId}`,
};
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
    decryptionSharesAlreadySubmitted: 'Decryption shares have already been submitted.',
    publicKeyPhaseClosed: 'Public key shares can only be submitted during key generation.',
    votingPhaseClosed: 'Votes can only be submitted during voting.',
    decryptionPhaseClosed: 'Decryption shares can only be submitted during decryption.',
    voteVectorLengthMismatch: 'Vote vector length must match the number of poll choices.',
    decryptionVectorLengthMismatch: 'Decryption share vector length must match the number of encrypted tallies.',
    maxParticipantsReached: 'Poll has reached its maximum number of participants.',
};
