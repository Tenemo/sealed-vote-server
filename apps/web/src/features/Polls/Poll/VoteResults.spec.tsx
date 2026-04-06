import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';

import VoteResults from './VoteResults';

import { useAppSelector } from 'app/hooks';
import { darkTheme } from 'styles/theme';

vi.mock('@sealed-vote/protocol', () => ({
    computeGeometricMean: (results: number[], voterCount: number) =>
        results.map((result) => result ** (1 / voterCount)),
}));

vi.mock('app/hooks', () => ({
    useAppSelector: vi.fn(),
}));

const mockedUseAppSelector = vi.mocked(useAppSelector);

describe('VoteResults', () => {
    it('renders geometric means using the voter count', () => {
        mockedUseAppSelector.mockReturnValue({
            results: [8, 27],
        } as never);
        const poll = {
            pollName: 'Best fruit',
            createdAt: '2026-01-01T00:00:00.000Z',
            choices: ['Apples', 'Bananas'],
            voters: ['Alice', 'Bob', 'Charlie'],
            isOpen: false,
            publicKeyShares: [],
            commonPublicKey: '123',
            encryptedVotes: [],
            encryptedTallies: [],
            decryptionShares: [],
            results: [],
        };

        render(
            <ThemeProvider theme={darkTheme}>
                <VoteResults poll={poll} pollId="poll-1" />
            </ThemeProvider>,
        );

        expect(screen.getByText('Apples')).toBeInTheDocument();
        expect(screen.getByText('Bananas')).toBeInTheDocument();
        expect(screen.getByText('Score: 2.00')).toBeInTheDocument();
        expect(screen.getByText('Score: 3.00')).toBeInTheDocument();
    });
});
