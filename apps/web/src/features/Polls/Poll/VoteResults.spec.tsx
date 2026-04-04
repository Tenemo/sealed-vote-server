import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import VoteResults from './VoteResults';

import { useAppSelector } from 'app/hooks';
import { useGetPollQuery } from 'features/Polls/pollsApi';
import { darkTheme } from 'styles/theme';

jest.mock('@sealed-vote/protocol', () => ({
    computeGeometricMean: (results: number[], voterCount: number) =>
        results.map((result) => result ** (1 / voterCount)),
}));

jest.mock('app/hooks', () => ({
    useAppSelector: jest.fn(),
}));

jest.mock('features/Polls/pollsApi', () => ({
    useGetPollQuery: jest.fn(),
}));

const mockedUseAppSelector = jest.mocked(useAppSelector);
const mockedUseGetPollQuery = jest.mocked(useGetPollQuery);

describe('VoteResults', () => {
    it('renders geometric means using the voter count', () => {
        mockedUseAppSelector.mockReturnValue({
            results: [8, 27],
        } as never);
        mockedUseGetPollQuery.mockReturnValue({
            data: {
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
            },
        } as never);

        render(
            <ThemeProvider theme={darkTheme}>
                <MemoryRouter initialEntries={['/votes/poll-1']}>
                    <Routes>
                        <Route
                            element={<VoteResults />}
                            path="/votes/:pollId"
                        />
                    </Routes>
                </MemoryRouter>
            </ThemeProvider>,
        );

        expect(screen.getByText('Apples')).toBeInTheDocument();
        expect(screen.getByText('Bananas')).toBeInTheDocument();
        expect(screen.getByText('Score: 2.00')).toBeInTheDocument();
        expect(screen.getByText('Score: 3.00')).toBeInTheDocument();
    });
});
