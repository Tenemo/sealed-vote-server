import type { ProtocolPayload } from 'threshold-elgamal';
import { describe, expect, test } from 'vitest';

import {
    canonicalUnsignedPayloadBytes,
    isProtocolMessageType,
    protocolPayloadSlotKey,
    sortProtocolPayloads,
} from '../src/index.js';

const decodeBytes = (value: Uint8Array): string =>
    new TextDecoder().decode(value);

const createRegistrationPayload = (
    overrides: Partial<ProtocolPayload> = {},
): ProtocolPayload =>
    ({
        authPublicKey: 'auth-public-key',
        manifestHash: 'a'.repeat(64),
        messageType: 'registration',
        participantIndex: 1,
        phase: 0,
        rosterHash: 'b'.repeat(64),
        sessionId: 'c'.repeat(64),
        transportPublicKey: 'transport-public-key',
        ...overrides,
    }) as ProtocolPayload;

const createBallotPayload = ({
    optionIndex,
    participantIndex,
}: {
    optionIndex: number;
    participantIndex: number;
}): ProtocolPayload =>
    ({
        ciphertext: {
            c1: `c1-${participantIndex}-${optionIndex}`,
            c2: `c2-${participantIndex}-${optionIndex}`,
        },
        manifestHash: 'a'.repeat(64),
        messageType: 'ballot-submission',
        optionIndex,
        participantIndex,
        phase: 5,
        proof: [],
        sessionId: 'c'.repeat(64),
    }) as ProtocolPayload;

describe('protocol payload helpers', () => {
    test('canonicalUnsignedPayloadBytes is stable across object key ordering', () => {
        const leftPayload = createRegistrationPayload({
            authPublicKey: 'auth-public-key-left',
            transportPublicKey: 'transport-public-key-left',
        });
        const rightPayload = {
            transportPublicKey: 'transport-public-key-left',
            sessionId: 'c'.repeat(64),
            rosterHash: 'b'.repeat(64),
            phase: 0,
            participantIndex: 1,
            messageType: 'registration',
            manifestHash: 'a'.repeat(64),
            authPublicKey: 'auth-public-key-left',
        } as ProtocolPayload;

        expect(decodeBytes(canonicalUnsignedPayloadBytes(leftPayload))).toBe(
            decodeBytes(canonicalUnsignedPayloadBytes(rightPayload)),
        );
    });

    test('protocolPayloadSlotKey uses the canonical slot dimensions for each message kind', () => {
        expect(
            protocolPayloadSlotKey(
                createRegistrationPayload({
                    participantIndex: 7,
                    sessionId: 'session-1',
                }),
            ),
        ).toBe('session-1:0:7:registration');

        expect(
            protocolPayloadSlotKey(
                createBallotPayload({
                    optionIndex: 2,
                    participantIndex: 3,
                }),
            ),
        ).toBe(`${'c'.repeat(64)}:5:3:ballot-submission:2`);

        expect(
            protocolPayloadSlotKey({
                manifestHash: 'a'.repeat(64),
                messageType: 'ballot-close',
                countedParticipantIndices: [1, 2, 3],
                participantIndex: 9,
                phase: 6,
                sessionId: 'session-2',
            } as ProtocolPayload),
        ).toBe('session-2:6:ballot-close');
    });

    test('sortProtocolPayloads orders payloads by slot before canonical payload bytes', () => {
        const sortedPayloads = sortProtocolPayloads([
            createBallotPayload({
                optionIndex: 2,
                participantIndex: 1,
            }),
            createRegistrationPayload({
                participantIndex: 2,
            }),
            createBallotPayload({
                optionIndex: 1,
                participantIndex: 1,
            }),
            createRegistrationPayload({
                participantIndex: 1,
            }),
        ]);

        expect(
            sortedPayloads.map((payload) => [
                payload.messageType,
                payload.participantIndex,
                protocolPayloadSlotKey(payload),
            ]),
        ).toEqual([
            ['registration', 1, `${'c'.repeat(64)}:0:1:registration`],
            ['registration', 2, `${'c'.repeat(64)}:0:2:registration`],
            [
                'ballot-submission',
                1,
                `${'c'.repeat(64)}:5:1:ballot-submission:1`,
            ],
            [
                'ballot-submission',
                1,
                `${'c'.repeat(64)}:5:1:ballot-submission:2`,
            ],
        ]);
    });

    test('isProtocolMessageType accepts shipped message types and rejects invalid values', () => {
        expect(isProtocolMessageType('registration')).toBe(true);
        expect(isProtocolMessageType('tally-publication')).toBe(true);
        expect(isProtocolMessageType('recover-session')).toBe(false);
        expect(isProtocolMessageType(null)).toBe(false);
    });
});
