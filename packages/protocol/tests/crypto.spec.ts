import { describe, expect, it } from 'vitest';

import {
    acceptedBoardMessages,
    filterBoardMessagesByType,
} from '../src/boardMessages';

import type { BoardMessageRecord } from '@sealed-vote/contracts';
import type { SignedPayload } from 'threshold-elgamal';

const createSignedPayload = (
    messageType: SignedPayload['payload']['messageType'],
    participantIndex: number,
): SignedPayload => ({
    payload: {
        sessionId: '1'.repeat(64),
        manifestHash: '2'.repeat(64),
        phase: 0,
        participantIndex,
        messageType,
        ...(messageType === 'registration'
            ? {
                  rosterHash: '3'.repeat(64),
                  authPublicKey: '4'.repeat(182),
                  transportPublicKey: '5'.repeat(64),
              }
            : {
                  checkpointPhase: 0,
                  checkpointTranscriptHash: '6'.repeat(64),
                  qualParticipantIndices: [1, 2, 3],
              }),
    } as SignedPayload['payload'],
    signature: '7'.repeat(128),
});

const createBoardEntry = ({
    classification,
    messageType,
    participantIndex,
}: {
    classification: BoardMessageRecord['classification'];
    messageType: BoardMessageRecord['messageType'];
    participantIndex: number;
}): BoardMessageRecord => ({
    id: `entry-${participantIndex}-${messageType}-${classification}`,
    createdAt: '2026-04-10T00:00:00.000Z',
    phase: 0,
    participantIndex,
    messageType,
    slotKey: `slot-${participantIndex}-${messageType}`,
    unsignedHash: `${participantIndex}`.repeat(64),
    previousEntryHash: null,
    entryHash: `${participantIndex + 1}`.repeat(64),
    classification,
    signedPayload: createSignedPayload(messageType, participantIndex),
});

describe('board message helpers', () => {
    it('returns only accepted payloads from the full board log', () => {
        const boardEntries = [
            createBoardEntry({
                classification: 'accepted',
                messageType: 'registration',
                participantIndex: 1,
            }),
            createBoardEntry({
                classification: 'idempotent',
                messageType: 'registration',
                participantIndex: 1,
            }),
            createBoardEntry({
                classification: 'equivocation',
                messageType: 'phase-checkpoint',
                participantIndex: 2,
            }),
            createBoardEntry({
                classification: 'accepted',
                messageType: 'phase-checkpoint',
                participantIndex: 3,
            }),
        ];

        const acceptedPayloads = acceptedBoardMessages(boardEntries);

        expect(acceptedPayloads).toHaveLength(2);
        expect(
            acceptedPayloads.map((payload) => payload.payload.messageType),
        ).toEqual(['registration', 'phase-checkpoint']);
    });

    it('filters accepted payloads by protocol message type', () => {
        const boardEntries = [
            createBoardEntry({
                classification: 'accepted',
                messageType: 'registration',
                participantIndex: 1,
            }),
            createBoardEntry({
                classification: 'accepted',
                messageType: 'registration',
                participantIndex: 2,
            }),
            createBoardEntry({
                classification: 'accepted',
                messageType: 'phase-checkpoint',
                participantIndex: 3,
            }),
            createBoardEntry({
                classification: 'idempotent',
                messageType: 'registration',
                participantIndex: 4,
            }),
        ];

        const registrations = filterBoardMessagesByType(
            boardEntries,
            'registration',
        );

        expect(registrations).toHaveLength(2);
        expect(
            registrations.map((payload) => payload.payload.participantIndex),
        ).toEqual([1, 2]);
    });
});
