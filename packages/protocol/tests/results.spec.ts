import { combinePublicKeys, generateKeys } from 'threshold-elgamal';
import { describe, expect, test } from 'vitest';

import {
    computeEncryptedTallies,
    createDecryptionSharesForTallies,
    serializeVotes,
} from '../src/crypto';
import { computeGeometricMean, verifyPublishedResults } from '../src/results';

describe('computeGeometricMean', () => {
    test('computes geometric means using the voter count', () => {
        const [firstResult, secondResult] = computeGeometricMean(
            ['1000', '125'],
            3,
        );

        expect(firstResult).toBeCloseTo(10);
        expect(secondResult).toBeCloseTo(5);
    });

    test('throws for empty voter counts', () => {
        expect(() => computeGeometricMean(['10'], 0)).toThrow(
            'Voter count must be greater than 0.',
        );
    });

    test('leaves one-voter results unchanged', () => {
        expect(computeGeometricMean(['4', '9', '16'], 1)).toEqual([4, 9, 16]);
    });

    test('keeps large tally strings precise before rounding to published scores', () => {
        expect(computeGeometricMean(['1000000000000000000'], 2)).toEqual([
            1000000000,
        ]);
    });

    test('rounds mixed vote distributions to 6 decimal places', () => {
        expect(computeGeometricMean(['240'], 3)).toEqual([6.214465]);
    });
});

describe('verifyPublishedResults', () => {
    test('verifies published tallies and scores against the ciphertexts and shares', () => {
        const voter1 = generateKeys(1, 2);
        const voter2 = generateKeys(2, 2);
        const commonPublicKey = combinePublicKeys([
            voter1.publicKey,
            voter2.publicKey,
        ]);
        const encryptedTallies = computeEncryptedTallies([
            serializeVotes(
                {
                    Apples: 2,
                    Bananas: 5,
                },
                ['Apples', 'Bananas'],
                commonPublicKey,
            ),
            serializeVotes(
                {
                    Apples: 7,
                    Bananas: 3,
                },
                ['Apples', 'Bananas'],
                commonPublicKey,
            ),
        ]);
        const publishedDecryptionShares = [
            createDecryptionSharesForTallies(
                encryptedTallies,
                voter1.privateKey,
            ),
            createDecryptionSharesForTallies(
                encryptedTallies,
                voter2.privateKey,
            ),
        ];

        expect(
            verifyPublishedResults({
                encryptedTallies,
                publishedDecryptionShares,
                resultTallies: ['14', '15'],
                resultScores: [3.741657, 3.872983],
                voterCount: 2,
            }),
        ).toEqual({
            computedScores: [3.741657, 3.872983],
            computedTallies: ['14', '15'],
            isVerified: true,
            scoresMatch: true,
            talliesMatch: true,
        });
    });

    test('detects mismatched published tallies and scores', () => {
        const voter1 = generateKeys(1, 2);
        const voter2 = generateKeys(2, 2);
        const commonPublicKey = combinePublicKeys([
            voter1.publicKey,
            voter2.publicKey,
        ]);
        const encryptedTallies = computeEncryptedTallies([
            serializeVotes(
                {
                    Apples: 2,
                    Bananas: 5,
                },
                ['Apples', 'Bananas'],
                commonPublicKey,
            ),
            serializeVotes(
                {
                    Apples: 7,
                    Bananas: 3,
                },
                ['Apples', 'Bananas'],
                commonPublicKey,
            ),
        ]);
        const publishedDecryptionShares = [
            createDecryptionSharesForTallies(
                encryptedTallies,
                voter1.privateKey,
            ),
            createDecryptionSharesForTallies(
                encryptedTallies,
                voter2.privateKey,
            ),
        ];

        expect(
            verifyPublishedResults({
                encryptedTallies,
                publishedDecryptionShares,
                resultTallies: ['15', '15'],
                resultScores: [3.9, 3.872983],
                voterCount: 2,
            }),
        ).toEqual({
            computedScores: [3.741657, 3.872983],
            computedTallies: ['14', '15'],
            isVerified: false,
            scoresMatch: false,
            talliesMatch: false,
        });
    });
});
