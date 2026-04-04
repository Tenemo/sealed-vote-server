import type { PollResponse } from '@sealed-vote/contracts';
import { combinePublicKeys, generateKeys } from 'threshold-elgamal';
import { describe, expect, test } from 'vitest';

import {
    canClose,
    canRegister,
    canSubmitDecryptionShares,
    canSubmitPublicKeyShare,
    canVote,
    computeEncryptedTallies,
    computeGeometricMean,
    createDecryptionSharesForTallies,
    decryptTallies,
    derivePollPhase,
    serializeVotes,
} from './index';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse => ({
    pollName: 'Test poll',
    createdAt: new Date().toISOString(),
    choices: ['Dog', 'Cat'],
    voters: ['Alice', 'Bob'],
    isOpen: true,
    publicKeyShares: [],
    commonPublicKey: null,
    encryptedVotes: [],
    encryptedTallies: [],
    decryptionShares: [],
    results: [],
    ...overrides,
});

describe('derivePollPhase', () => {
    test('returns registration for open polls', () => {
        expect(derivePollPhase(createPoll())).toBe('registration');
    });

    test('returns key-generation for closed polls without common key', () => {
        expect(derivePollPhase(createPoll({ isOpen: false }))).toBe(
            'key-generation',
        );
    });

    test('returns voting when common key exists and tallies are absent', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                }),
            ),
        ).toBe('voting');
    });

    test('returns decryption when tallies exist and results are missing', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                    encryptedTallies: [{ c1: '1', c2: '2' }],
                }),
            ),
        ).toBe('decryption');
    });

    test('returns complete when results exist', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                    results: [42],
                }),
            ),
        ).toBe('complete');
    });
});

describe('guards', () => {
    test('reflect the current poll phase', () => {
        const registrationPoll = createPoll();
        expect(canRegister(registrationPoll)).toBe(true);
        expect(canClose(registrationPoll)).toBe(true);
        expect(canSubmitPublicKeyShare(registrationPoll)).toBe(false);

        const votingPoll = createPoll({
            isOpen: false,
            commonPublicKey: '123',
        });
        expect(canVote(votingPoll)).toBe(true);
        expect(canSubmitDecryptionShares(votingPoll)).toBe(false);
    });
});

describe('crypto helpers', () => {
    test('computes geometric means using voter count', () => {
        const [firstResult, secondResult] = computeGeometricMean(
            [1000, 125],
            3,
        );

        expect(firstResult).toBeCloseTo(10);
        expect(secondResult).toBeCloseTo(5);
    });

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
});
