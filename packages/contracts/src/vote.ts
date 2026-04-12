import type { ProtocolMessageType, SignedPayload } from 'threshold-elgamal';

export type BoardMessageRequest = {
    signedPayload: SignedPayload;
    voterToken: string;
};

export type BoardMessageRecord = {
    id: string;
    createdAt: string;
    phase: number;
    participantIndex: number;
    messageType: ProtocolMessageType;
    slotKey: string;
    unsignedHash: string;
    previousEntryHash: string | null;
    entryHash: string;
    classification: 'accepted' | 'idempotent' | 'equivocation';
    signedPayload: SignedPayload;
};

export type BoardMessagesResponse = {
    pollId: string;
    messages: BoardMessageRecord[];
};
