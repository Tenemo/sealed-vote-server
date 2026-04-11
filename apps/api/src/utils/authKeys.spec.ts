import { describe, expect, test } from 'vitest';
import { exportAuthPublicKey, generateAuthKeyPair } from 'threshold-elgamal';

import { importAuthPublicKey, verifyAuthSignature } from './authKeys.js';

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
});
