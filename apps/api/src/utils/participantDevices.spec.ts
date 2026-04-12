import { describe, expect, it } from 'vitest';

import {
    parseParticipantDeviceRecord,
    serializeParticipantDeviceRecord,
} from './participantDevices';

describe('participantDevices', () => {
    it('round-trips a valid participant device record', () => {
        const record = {
            authPublicKey: 'auth-key',
            transportPublicKey: 'transport-key',
            transportSuite: 'X25519' as const,
        };

        expect(
            parseParticipantDeviceRecord(
                serializeParticipantDeviceRecord(record),
            ),
        ).toEqual(record);
    });

    it('rejects device records with missing required fields', () => {
        expect(
            parseParticipantDeviceRecord(
                JSON.stringify({
                    authPublicKey: 'auth-key',
                    transportSuite: 'X25519',
                }),
            ),
        ).toBeNull();
    });

    it('rejects device records with an unsupported transport suite', () => {
        expect(
            parseParticipantDeviceRecord(
                JSON.stringify({
                    authPublicKey: 'auth-key',
                    transportPublicKey: 'transport-key',
                    transportSuite: 'P-256',
                }),
            ),
        ).toBeNull();
    });

    it('rejects non-JSON values', () => {
        expect(parseParticipantDeviceRecord('not json')).toBeNull();
    });

    it('rejects valid JSON with wrong field types', () => {
        expect(
            parseParticipantDeviceRecord(
                JSON.stringify({
                    authPublicKey: 123,
                    transportPublicKey: ['transport-key'],
                    transportSuite: 'X25519',
                }),
            ),
        ).toBeNull();
    });
});
