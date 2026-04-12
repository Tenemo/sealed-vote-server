import { describe, expect, test } from 'vitest';
import { exportAuthPublicKey, generateAuthKeyPair } from 'threshold-elgamal';

import { importAuthPublicKey, verifyAuthSignature } from './authKeys.js';

const bytesToHex = (bytes: ArrayBuffer | Uint8Array): string =>
    [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

describe('authKeys', () => {
    test('imports a valid exported auth public key', async () => {
        const keyPair = await generateAuthKeyPair();
        const exportedPublicKey = await exportAuthPublicKey(keyPair.publicKey);

        const importedKey = await importAuthPublicKey(exportedPublicKey);

        expect(importedKey.type).toBe('public');
        expect(importedKey.algorithm.name).toBe('Ed25519');
    });

    test('rejects malformed auth public key hex', async () => {
        await expect(importAuthPublicKey('abc')).rejects.toThrow(TypeError);
        await expect(importAuthPublicKey('zz')).rejects.toThrow(TypeError);
    });

    test('rejects malformed signature hex before verification', async () => {
        const keyPair = await generateAuthKeyPair();
        const exportedPublicKey = await exportAuthPublicKey(keyPair.publicKey);
        const publicKey = await importAuthPublicKey(exportedPublicKey);

        await expect(
            verifyAuthSignature({
                payloadBytes: new Uint8Array([1, 2, 3]),
                publicKey,
                signature: 'not-hex',
            }),
        ).rejects.toThrow(TypeError);
    });

    test('verifies a valid signature for a payload subarray without copying it first', async () => {
        const keyPair = await generateAuthKeyPair();
        const exportedPublicKey = await exportAuthPublicKey(keyPair.publicKey);
        const publicKey = await importAuthPublicKey(exportedPublicKey);
        const payloadBytes = new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4);
        const signature = bytesToHex(
            await crypto.subtle.sign(
                'Ed25519',
                keyPair.privateKey,
                payloadBytes,
            ),
        );

        await expect(
            verifyAuthSignature({
                payloadBytes,
                publicKey,
                signature,
            }),
        ).resolves.toBe(true);
    });

    test('returns false when the signature does not match the payload bytes', async () => {
        const keyPair = await generateAuthKeyPair();
        const exportedPublicKey = await exportAuthPublicKey(keyPair.publicKey);
        const publicKey = await importAuthPublicKey(exportedPublicKey);
        const signedPayload = new Uint8Array([1, 2, 3]);
        const signature = bytesToHex(
            await crypto.subtle.sign(
                'Ed25519',
                keyPair.privateKey,
                signedPayload,
            ),
        );

        await expect(
            verifyAuthSignature({
                payloadBytes: new Uint8Array([1, 2, 4]),
                publicKey,
                signature,
            }),
        ).resolves.toBe(false);
    });
});
