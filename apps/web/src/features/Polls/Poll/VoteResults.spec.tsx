import { render, screen, within } from '@testing-library/react';

import VoteResults from './VoteResults';

const mockedVerifyPublishedResults = vi.fn();

vi.mock('@sealed-vote/protocol', () => ({
    verifyPublishedResults: (...args: unknown[]) =>
        mockedVerifyPublishedResults(...args),
}));

describe('VoteResults', () => {
    beforeEach(() => {
        mockedVerifyPublishedResults.mockReset();
    });

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

    it('renders a separate message when local verification crashes', () => {
        mockedVerifyPublishedResults.mockImplementation(() => {
            throw new Error('broken verification payload');
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

        expect(
            screen.getByText(
                /Public verification could not be completed locally\./i,
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Public verification failed\./i),
        ).not.toBeInTheDocument();
    });

    it('marks only the first three published results with placement icons', () => {
        mockedVerifyPublishedResults.mockReturnValue({
            computedScores: [8, 10, 9, 7],
            computedTallies: ['8', '10', '9', '7'],
            isVerified: true,
            scoresMatch: true,
            talliesMatch: true,
        });

        const poll = {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'best-fruit--1111',
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples', 'Bananas', 'Cherries', 'Dates'],
            voters: ['Alice', 'Bob'],
            isOpen: false,
            publicKeyShareCount: 2,
            commonPublicKey: '123',
            encryptedVoteCount: 2,
            encryptedTallies: [
                { c1: '1', c2: '8' },
                { c1: '1', c2: '10' },
                { c1: '1', c2: '9' },
                { c1: '1', c2: '7' },
            ],
            decryptionShareCount: 2,
            publishedDecryptionShares: [
                ['share-a-1', 'share-a-2', 'share-a-3', 'share-a-4'],
                ['share-b-1', 'share-b-2', 'share-b-3', 'share-b-4'],
            ],
            resultTallies: ['8', '10', '9', '7'],
            resultScores: [8, 10, 9, 7],
        };

        render(<VoteResults poll={poll} pollId="poll-1" />);

        expect(screen.getAllByLabelText('Winner')).toHaveLength(1);
        expect(screen.getAllByLabelText('Runner-up')).toHaveLength(1);
        expect(screen.getAllByLabelText('Third place')).toHaveLength(1);

        const resultItems = screen.getAllByRole('listitem');
        const fourthResult = resultItems[3];

        expect(resultItems).toHaveLength(4);

        if (!fourthResult) {
            throw new Error('Missing fourth result item.');
        }

        expect(
            within(fourthResult).queryByLabelText(
                /winner|runner-up|third place/i,
            ),
        ).not.toBeInTheDocument();
    });
});
