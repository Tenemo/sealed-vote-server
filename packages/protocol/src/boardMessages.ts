import type { BoardMessageRecord } from '@sealed-vote/contracts';
import type { ProtocolMessageType, SignedPayload } from 'threshold-elgamal';

export const filterBoardMessagesByType = (
    boardEntries: readonly BoardMessageRecord[],
    messageType: ProtocolMessageType,
): SignedPayload[] =>
    boardEntries
        .filter(
            (entry) =>
                entry.classification === 'accepted' &&
                entry.messageType === messageType,
        )
        .map((entry) => entry.signedPayload);

export const acceptedBoardMessages = (
    boardEntries: readonly BoardMessageRecord[],
): SignedPayload[] =>
    boardEntries
        .filter((entry) => entry.classification === 'accepted')
        .map((entry) => entry.signedPayload);
