import { describe, expect, test } from 'vitest';
import type { BoardMessageRecord } from '@sealed-vote/contracts';
import type { BallotClosePayload, SignedPayload } from 'threshold-elgamal';

import { deriveBallotCloseSlotState } from './poll-read-model.js';

const fixedSessionId = 'a'.repeat(64);
const fixedManifestHash = 'b'.repeat(64);

const createBallotClosePayload = (
    overrides: Partial<BallotClosePayload> = {},
): SignedPayload<BallotClosePayload> => ({
    payload: {
        countedParticipantIndices: [1, 2, 3],
        manifestHash: fixedManifestHash,
        messageType: 'ballot-close',
        participantIndex: 1,
        phase: 6,
        protocolVersion: 'v1',
        sessionId: fixedSessionId,
        ...overrides,
    },
    signature: 'c'.repeat(128),
});

const createBoardRecord = ({
    classification,
    id,
    signedPayload,
    slotKey,
}: {
    classification: BoardMessageRecord['classification'];
    id: string;
    signedPayload: SignedPayload<BallotClosePayload>;
    slotKey?: string;
}): BoardMessageRecord => ({
    classification,
    createdAt: '2026-04-16T08:00:00.000Z',
    entryHash: `entry-${id}`,
    id,
    messageType: signedPayload.payload.messageType,
    participantIndex: signedPayload.payload.participantIndex,
    phase: signedPayload.payload.phase,
    previousEntryHash: null,
    signedPayload,
    slotKey:
        slotKey ??
        `${signedPayload.payload.sessionId}:${signedPayload.payload.phase}:ballot-close`,
    unsignedHash: `unsigned-${id}`,
});

describe('pollReadModel ballot close slot state', () => {
    test('treats an empty ballot close slot as unoccupied', () => {
        const slotState = deriveBallotCloseSlotState({
            acceptedPayloads: [],
            currentSessionRecords: [],
        });

        expect(slotState).toMatchObject({
            acceptedPayload: null,
            invalidReason: null,
            occupied: false,
            rawPayloads: [],
        });
    });

    test('accepts one canonical ballot close payload with idempotent retransmissions', () => {
        const acceptedPayload = createBallotClosePayload();
        const duplicatePayload = {
            ...acceptedPayload,
            signature: 'd'.repeat(128),
        };

        const slotState = deriveBallotCloseSlotState({
            acceptedPayloads: [acceptedPayload],
            currentSessionRecords: [
                createBoardRecord({
                    classification: 'accepted',
                    id: 'accepted',
                    signedPayload: acceptedPayload,
                }),
                createBoardRecord({
                    classification: 'idempotent',
                    id: 'duplicate',
                    signedPayload: duplicatePayload,
                }),
            ],
        });

        expect(slotState.acceptedPayload).toEqual(acceptedPayload);
        expect(slotState.acceptedPayloads).toEqual([acceptedPayload]);
        expect(slotState.invalidReason).toBeNull();
        expect(slotState.occupied).toBe(true);
        expect(slotState.rawPayloads).toEqual([
            acceptedPayload,
            duplicatePayload,
        ]);
    });

    test('rejects ballot close equivocation within one canonical slot', () => {
        const firstPayload = createBallotClosePayload({
            countedParticipantIndices: [1, 2, 3],
        });
        const conflictingPayload = createBallotClosePayload({
            countedParticipantIndices: [1, 2],
        });

        const slotState = deriveBallotCloseSlotState({
            acceptedPayloads: [],
            currentSessionRecords: [
                createBoardRecord({
                    classification: 'equivocation',
                    id: 'equivocation-1',
                    signedPayload: firstPayload,
                }),
                createBoardRecord({
                    classification: 'equivocation',
                    id: 'equivocation-2',
                    signedPayload: conflictingPayload,
                }),
            ],
        });

        expect(slotState.acceptedPayload).toBeNull();
        expect(slotState.invalidReason).toBe(
            'Detected ballot-close equivocation for the current session.',
        );
        expect(slotState.occupied).toBe(true);
    });

    test('rejects multiple accepted ballot close payloads across distinct slots', () => {
        const firstPayload = createBallotClosePayload({
            phase: 6,
        });
        const secondPayload = createBallotClosePayload({
            phase: 7,
        });

        const slotState = deriveBallotCloseSlotState({
            acceptedPayloads: [firstPayload, secondPayload],
            currentSessionRecords: [
                createBoardRecord({
                    classification: 'accepted',
                    id: 'accepted-1',
                    signedPayload: firstPayload,
                    slotKey: `${fixedSessionId}:6:ballot-close`,
                }),
                createBoardRecord({
                    classification: 'accepted',
                    id: 'accepted-2',
                    signedPayload: secondPayload,
                    slotKey: `${fixedSessionId}:7:ballot-close`,
                }),
            ],
        });

        expect(slotState.acceptedPayload).toBeNull();
        expect(slotState.invalidReason).toBe(
            'Ballot close requires exactly one accepted payload in the current session.',
        );
        expect(slotState.occupied).toBe(true);
    });
});
