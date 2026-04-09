import { hasPublishedResults, normalizePollResponse } from './pollData';

describe('normalizePollResponse', () => {
    it('returns the supported poll response unchanged', () => {
        const normalizedPoll = normalizePollResponse({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples', 'Bananas'],
            voters: ['Alice'],
            isOpen: false,
            publicKeyShareCount: 1,
            encryptedVoteCount: 1,
            decryptionShareCount: 1,
            commonPublicKey: '123',
            encryptedTallies: [{ c1: '1', c2: '2' }],
            publishedDecryptionShares: [['share-1']],
            resultTallies: ['49'],
            resultScores: [7.25],
        });

        expect(normalizedPoll).toEqual({
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples', 'Bananas'],
            voters: ['Alice'],
            isOpen: false,
            publicKeyShareCount: 1,
            encryptedVoteCount: 1,
            decryptionShareCount: 1,
            commonPublicKey: '123',
            encryptedTallies: [{ c1: '1', c2: '2' }],
            publishedDecryptionShares: [['share-1']],
            resultTallies: ['49'],
            resultScores: [7.25],
        });
    });
});

describe('hasPublishedResults', () => {
    it('returns true only when the normalized result score list is present', () => {
        expect(hasPublishedResults(null)).toBe(false);
        expect(hasPublishedResults({ resultScores: [] })).toBe(false);
        expect(hasPublishedResults({ resultScores: [3.14] })).toBe(true);
    });
});
