import { describe, expect, it } from 'vitest';

import {
    parseVoterDeviceRecord,
    serializeVoterDeviceRecord,
} from './voter-device-records';

describe('participantDevices', () => {
    it('round-trips a valid participant device record', () => {
        const record = {
            authPublicKey: 'auth-key',
            transportPublicKey: 'transport-key',
            transportSuite: 'X25519' as const,
        };

        expect(
            parseVoterDeviceRecord(serializeVoterDeviceRecord(record)),
        ).toEqual(record);
    });

    it('rejects device records with missing required fields', () => {
        expect(
            parseVoterDeviceRecord(
                JSON.stringify({
                    authPublicKey: 'auth-key',
                    transportSuite: 'X25519',
                }),
            ),
        ).toBeNull();
    });

    it('rejects device records with an unsupported transport suite', () => {
        expect(
            parseVoterDeviceRecord(
                JSON.stringify({
                    authPublicKey: 'auth-key',
                    transportPublicKey: 'transport-key',
                    transportSuite: 'P-256',
                }),
            ),
        ).toBeNull();
    });

    it('rejects non-JSON values', () => {
        expect(parseVoterDeviceRecord('not json')).toBeNull();
    });

    it('rejects valid JSON with wrong field types', () => {
        expect(
            parseVoterDeviceRecord(
                JSON.stringify({
                    authPublicKey: 123,
                    transportPublicKey: ['transport-key'],
                    transportSuite: 'X25519',
                }),
            ),
        ).toBeNull();
    });
});
