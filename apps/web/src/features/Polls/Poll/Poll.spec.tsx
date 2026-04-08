import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { skipToken } from '@reduxjs/toolkit/query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Poll from './Poll';

import { TooltipProvider } from '@/components/ui/tooltip';
import {
    initialVoteState,
    setSelectedScores,
    setVoterSession,
    votingSlice,
} from 'features/Polls/votingSlice';
import type { VotingState } from 'features/Polls/votingState';

const mockedVote = vi.fn((payload: unknown) => ({
    payload,
    type: 'voting/vote',
}));
const mockedUseGetPollQuery = vi.fn();
const mockedUseClosePollMutation = vi.fn();

vi.mock('features/Polls/votingThunks/vote', () => ({
    vote: (payload: unknown) => mockedVote(payload),
}));

vi.mock('features/Polls/pollsApi', () => ({
    pollsApi: {
        endpoints: {
            createPoll: {
                matchFulfilled: () => false,
            },
        },
    },
    useGetPollQuery: (pollId: string, options?: unknown) =>
        mockedUseGetPollQuery(pollId, options),
    useClosePollMutation: () => mockedUseClosePollMutation(),
}));

const basePoll = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'best-fruit--11111111',
    pollName: 'Best fruit',
    createdAt: '2026-01-01T00:00:00.000Z',
    choices: ['Apples'],
    voters: ['Alice'],
    isOpen: false,
    publicKeyShareCount: 1,
    encryptedVoteCount: 0,
    decryptionShareCount: 0,
    commonPublicKey: null,
    encryptedTallies: [],
    results: [],
};

const renderPoll = (
    preloadedVotingState: VotingState = {},
    initialEntry: string = '/votes/best-fruit--11111111',
): EnhancedStore<{ voting: VotingState }> => {
    const store = configureStore({
        preloadedState: {
            voting: preloadedVotingState,
        },
        reducer: {
            voting: votingSlice.reducer,
        },
    });

    render(
        <Provider store={store}>
            <HelmetProvider>
                <TooltipProvider>
                    <MemoryRouter initialEntries={[initialEntry]}>
                        <Routes>
                            <Route element={<Poll />} path="/votes/:pollSlug" />
                        </Routes>
                    </MemoryRouter>
                </TooltipProvider>
            </HelmetProvider>
        </Provider>,
    );

    return store;
};

describe('Poll page', () => {
    beforeEach(() => {
        mockedVote.mockClear();
        mockedUseGetPollQuery.mockReset();
        mockedUseClosePollMutation.mockReset();

        mockedUseGetPollQuery.mockReturnValue({
            data: basePoll,
            error: undefined,
            isLoading: false,
        });
        mockedUseClosePollMutation.mockReturnValue([
            vi.fn(),
            { error: undefined, isLoading: false },
        ]);
    });

    it('resumes a persisted voting session that already existed on mount', async () => {
        renderPoll({
            '11111111-1111-4111-8111-111111111111': {
                ...initialVoteState,
                selectedScores: {
                    Apples: 7,
                },
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
            },
        });

        await waitFor(() => {
            expect(mockedVote).toHaveBeenCalledWith({
                pollId: '11111111-1111-4111-8111-111111111111',
                selectedScores: { Apples: 7 },
                voterName: 'Alice',
            });
        });
    });

    it('does not auto-resume when the voting session appears only after mount', async () => {
        const store = renderPoll();

        await act(async () => {
            store.dispatch(
                setSelectedScores({
                    pollId: '11111111-1111-4111-8111-111111111111',
                    selectedScores: { Apples: 7 },
                }),
            );
            store.dispatch(
                setVoterSession({
                    pollId: '11111111-1111-4111-8111-111111111111',
                    voterIndex: 1,
                    voterName: 'Alice',
                    voterToken: 'voter-token',
                }),
            );
        });

        expect(mockedVote).not.toHaveBeenCalled();
    });

    it('renders workflow failures from state', () => {
        renderPoll({
            '11111111-1111-4111-8111-111111111111': {
                ...initialVoteState,
                workflowError: 'Public key share submission failed.',
            },
        });

        expect(
            screen.getByText('Public key share submission failed.'),
        ).toBeInTheDocument();
    });

    it('shows not found for legacy uuid vote links', () => {
        renderPoll({}, '/votes/11111111-1111-4111-8111-111111111111');

        expect(screen.getByText(/not found\./i)).toBeInTheDocument();
        expect(mockedUseGetPollQuery).toHaveBeenCalledWith(
            skipToken,
            expect.objectContaining({
                pollingInterval: 3000,
            }),
        );
    });

    it('shows a non-blocking connection toast when polling fails after data has loaded', () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: basePoll,
            error: {
                error: 'TypeError: Failed to fetch',
                status: 'FETCH_ERROR',
            },
            isLoading: false,
        });

        renderPoll();

        expect(
            screen.getByRole('heading', { name: 'Best fruit' }),
        ).toBeVisible();
        expect(
            screen.getByText(
                'Connection to the server was lost. Showing the latest available vote state and retrying in the background.',
            ),
        ).toBeVisible();
        expect(
            screen.queryByText('TypeError: Failed to fetch'),
        ).not.toBeInTheDocument();
    });

    it('shows a friendly reconnect state when the poll cannot be loaded because the connection was lost', () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: undefined,
            error: {
                error: 'TypeError: Failed to fetch',
                status: 'FETCH_ERROR',
            },
            isLoading: false,
        });

        renderPoll();

        expect(
            screen.getByRole('heading', { name: 'Connection lost' }),
        ).toBeVisible();
        expect(
            screen.getByText(
                /The app will keep retrying in the background and will recover automatically once the connection is back\./i,
            ),
        ).toBeVisible();
        expect(
            screen.queryByText('TypeError: Failed to fetch'),
        ).not.toBeInTheDocument();
    });
});
