import { combinePublicKeys, generateKeys } from 'threshold-elgamal';
import { describe, expect, test } from 'vitest';

import {
    computeEncryptedTallies,
    createDecryptionSharesForTallies,
    decryptTallies,
    serializeVotes,
} from '../crypto';

describe('crypto helpers', () => {
    test('serializes votes in choice order and decrypts tallies', () => {
        const voter1 = generateKeys(1, 2);
        const voter2 = generateKeys(2, 2);
        const commonPublicKey = combinePublicKeys([
            voter1.publicKey,
            voter2.publicKey,
        ]);

        const votes = [
            serializeVotes({ Dog: 9, Cat: 4 }, ['Dog', 'Cat'], commonPublicKey),
            serializeVotes({ Dog: 3, Cat: 2 }, ['Dog', 'Cat'], commonPublicKey),
        ];

        const tallies = computeEncryptedTallies(votes);
        const shares = [
            createDecryptionSharesForTallies(tallies, voter1.privateKey),
            createDecryptionSharesForTallies(tallies, voter2.privateKey),
        ];

        expect(decryptTallies(tallies, shares)).toEqual([27, 8]);
    });

    test('throws when a score is missing for one of the choices', () => {
        const voter = generateKeys(1, 1);

        expect(() =>
            serializeVotes({ Dog: 9 }, ['Dog', 'Cat'], voter.publicKey),
        ).toThrow('Missing score for choice "Cat".');
    });

    test('returns empty arrays for empty tallies or votes', () => {
        expect(computeEncryptedTallies([])).toEqual([]);
        expect(decryptTallies([], [])).toEqual([]);
    });
});
