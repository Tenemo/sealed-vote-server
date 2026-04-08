import { render, screen } from '@testing-library/react';

import VoteResults from './VoteResults';

const mockedVerifyPublishedResults = vi.fn();

vi.mock('@sealed-vote/protocol', () => ({
    verifyPublishedResults: (...args: unknown[]) =>
        mockedVerifyPublishedResults(...args),
}));

describe('VoteResults', () => {
    it('renders published scores and verification status', () => {
        mockedVerifyPublishedResults.mockReturnValue({
            computedScores: [2, 3],
            computedTallies: ['8', '27'],
            isVerified: true,
            scoresMatch: true,
            talliesMatch: true,
        });

        const poll = {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples', 'Bananas'],
            voters: ['Alice', 'Bob', 'Charlie'],
            isOpen: false,
            publicKeyShareCount: 3,
            commonPublicKey: '123',
            encryptedVoteCount: 3,
            encryptedTallies: [
                { c1: '1', c2: '2' },
                { c1: '3', c2: '4' },
            ],
            decryptionShareCount: 3,
            publishedDecryptionShares: [
                ['share-a-1', 'share-a-2'],
                ['share-b-1', 'share-b-2'],
                ['share-c-1', 'share-c-2'],
            ],
            resultTallies: ['8', '27'],
            resultScores: [2, 3],
        };

        render(<VoteResults poll={poll} pollId="poll-1" />);

        expect(screen.getByText('Apples')).toBeInTheDocument();
        expect(screen.getByText('Bananas')).toBeInTheDocument();
        expect(screen.getByText('Score: 2.00')).toBeInTheDocument();
        expect(screen.getByText('Score: 3.00')).toBeInTheDocument();
        expect(
            screen.getByText(/Public verification passed\./i),
        ).toBeInTheDocument();
    });
});
