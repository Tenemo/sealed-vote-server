import type { ProtocolPayload, SignedPayload } from 'threshold-elgamal';
import { describe, expect, test } from 'vitest';

import {
    canonicalUnsignedPayloadBytes,
    countSignedPayloadsOfType,
    filterSignedPayloadsBySession,
    getSignedPayloadsOfType,
    isSignedPayloadOfType,
    isProtocolMessageType,
    protocolPayloadSlotKey,
    signedProtocolPayloadBytes,
    sortProtocolPayloads,
} from '../src/index.js';

const decodeBytes = (value: Uint8Array): string =>
    new TextDecoder().decode(value);

const bytesToHex = (value: Uint8Array): string =>
    Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

const createRegistrationPayload = (
    overrides: Partial<ProtocolPayload> = {},
): ProtocolPayload =>
    ({
        authPublicKey: 'auth-public-key' as never,
        manifestHash: 'a'.repeat(64),
        messageType: 'registration',
        participantIndex: 1,
        phase: 0,
        protocolVersion: 'v1',
        rosterHash: 'b'.repeat(64),
        sessionId: 'c'.repeat(64),
        transportPublicKey: 'transport-public-key' as never,
        ...overrides,
    }) as ProtocolPayload;

const createBallotPayload = ({
    optionIndex,
    participantIndex,
    sessionId = 'c'.repeat(64),
}: {
    optionIndex: number;
    participantIndex: number;
    sessionId?: string;
}): ProtocolPayload =>
    ({
        ciphertext: {
            c1: `c1-${participantIndex}-${optionIndex}`,
            c2: `c2-${participantIndex}-${optionIndex}`,
        } as never,
        manifestHash: 'a'.repeat(64),
        messageType: 'ballot-submission',
        optionIndex,
        participantIndex,
        phase: 5,
        protocolVersion: 'v1',
        proof: {
            branches: [],
        } as never,
        sessionId,
    }) as ProtocolPayload;

const createSignedPayload = (
    payload: ProtocolPayload,
    signatureSeed: string,
): SignedPayload =>
    ({
        payload,
        signature: signatureSeed.repeat(128),
    }) as SignedPayload;

describe('protocol payload helpers', () => {
    test('canonicalUnsignedPayloadBytes is stable across object key ordering', () => {
        const leftPayload = createRegistrationPayload({
            authPublicKey: 'auth-public-key-left' as never,
            transportPublicKey: 'transport-public-key-left' as never,
        });
        const rightPayload = {
            transportPublicKey: 'transport-public-key-left' as never,
            sessionId: 'c'.repeat(64),
            rosterHash: 'b'.repeat(64),
            phase: 0,
            participantIndex: 1,
            messageType: 'registration',
            manifestHash: 'a'.repeat(64),
            protocolVersion: 'v1',
            authPublicKey: 'auth-public-key-left' as never,
        } as ProtocolPayload;

        expect(decodeBytes(canonicalUnsignedPayloadBytes(leftPayload))).toBe(
            decodeBytes(canonicalUnsignedPayloadBytes(rightPayload)),
        );
    });

    test('signedProtocolPayloadBytes is stable across object key ordering and distinct from unsigned bytes', () => {
        const leftPayload = createRegistrationPayload({
            authPublicKey: 'auth-public-key-left' as never,
            transportPublicKey: 'transport-public-key-left' as never,
        });
        const rightPayload = {
            transportPublicKey: 'transport-public-key-left' as never,
            sessionId: 'c'.repeat(64),
            rosterHash: 'b'.repeat(64),
            phase: 0,
            participantIndex: 1,
            messageType: 'registration',
            manifestHash: 'a'.repeat(64),
            protocolVersion: 'v1',
            authPublicKey: 'auth-public-key-left' as never,
        } as ProtocolPayload;

        expect(bytesToHex(signedProtocolPayloadBytes(leftPayload))).toBe(
            bytesToHex(signedProtocolPayloadBytes(rightPayload)),
        );
        expect(bytesToHex(signedProtocolPayloadBytes(leftPayload))).not.toBe(
            bytesToHex(canonicalUnsignedPayloadBytes(leftPayload)),
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
                protocolVersion: 'v1',
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

    test('signed payload selectors filter by message type without changing order', () => {
        const registrationPayload = createSignedPayload(
            createRegistrationPayload({
                participantIndex: 1,
            }),
            'a',
        );
        const firstBallotPayload = createSignedPayload(
            createBallotPayload({
                optionIndex: 2,
                participantIndex: 3,
            }),
            'b',
        );
        const secondBallotPayload = createSignedPayload(
            createBallotPayload({
                optionIndex: 1,
                participantIndex: 2,
            }),
            'c',
        );
        const signedPayloads = [
            registrationPayload,
            firstBallotPayload,
            secondBallotPayload,
        ];

        expect(
            getSignedPayloadsOfType(signedPayloads, 'ballot-submission').map(
                (signedPayload) => [
                    signedPayload.payload.participantIndex,
                    signedPayload.payload.optionIndex,
                ],
            ),
        ).toEqual([
            [3, 2],
            [2, 1],
        ]);
        expect(countSignedPayloadsOfType(signedPayloads, 'registration')).toBe(
            1,
        );
        expect(
            countSignedPayloadsOfType(signedPayloads, 'decryption-share'),
        ).toBe(0);
        expect(isSignedPayloadOfType(registrationPayload, 'registration')).toBe(
            true,
        );
        expect(
            isSignedPayloadOfType(registrationPayload, 'ballot-submission'),
        ).toBe(false);
    });

    test('filterSignedPayloadsBySession keeps only the active session and rejects missing sessions', () => {
        const firstSessionId = '1'.repeat(64);
        const secondSessionId = '2'.repeat(64);
        const signedPayloads = [
            createSignedPayload(
                createRegistrationPayload({
                    participantIndex: 1,
                    sessionId: firstSessionId,
                }),
                'a',
            ),
            createSignedPayload(
                createBallotPayload({
                    optionIndex: 0,
                    participantIndex: 2,
                    sessionId: secondSessionId,
                }),
                'b',
            ),
            createSignedPayload(
                createRegistrationPayload({
                    participantIndex: 3,
                    sessionId: firstSessionId,
                }),
                'c',
            ),
        ];

        expect(
            filterSignedPayloadsBySession({
                sessionId: firstSessionId,
                signedPayloads,
            }).map((signedPayload) => signedPayload.payload.participantIndex),
        ).toEqual([1, 3]);
        expect(
            filterSignedPayloadsBySession({
                sessionId: null,
                signedPayloads,
            }),
        ).toEqual([]);
    });
});
