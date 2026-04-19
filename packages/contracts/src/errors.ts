export type MessageResponse = {
    message: string;
};

export const ERROR_MESSAGES = {
    invalidPollId: 'Invalid poll ID.',
    duplicateVoterName: 'Voter name is already taken for this poll.',
    pollClosed: 'Poll is closed for new registrations.',
    pollAlreadyClosed: 'Poll is already closed.',
    notEnoughVotersToClose:
        'At least 3 submitted voters are required before voting can close.',
    invalidCreatorToken: 'Invalid creator token.',
    invalidVoterToken: 'Invalid voter token.',
    creatorTokenConflict:
        'Creator token was already used for a different poll.',
    voterTokenConflict:
        'Voter token was already used for a different voter name.',
    voterDeviceKeysRequired:
        'Every submitted voter must keep the same device keys for the ceremony.',
    ceremonyRestartUnavailable:
        'The ceremony can only be restarted while voting is still being secured.',
    ceremonyRestartNoBlockers:
        'There are no currently blocking voters to skip.',
    ceremonyRestartMinimumParticipants:
        'At least 3 active voters are required to restart the ceremony.',
    maximumVoterCountReached: 'Poll has reached its maximum number of voters.',
    boardMessageSignatureRequired:
        'A signed protocol payload is required for board submission.',
    boardMessagePayloadInvalid:
        'The submitted protocol payload has an invalid shape.',
    boardMessageConflict:
        'A conflicting payload has already been recorded for this protocol slot.',
    boardMessageCursorInvalid:
        'The requested board cursor does not exist for this poll.',
    boardMessageParticipantMismatch:
        'The submitted payload does not match the authenticated participant.',
    boardMessageCreatorOnly:
        'This payload can only be posted with the creator token.',
    boardMessageSkippedParticipant:
        'This participant is no longer part of the active ceremony.',
    boardMessageSessionMismatch:
        'The submitted payload does not match the active ceremony session.',
} as const;
