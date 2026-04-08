import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { skipToken } from '@reduxjs/toolkit/query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Poll from './Poll';

import { TooltipProvider } from '@/components/ui/tooltip';
import { initialVoteState, votingSlice } from 'features/Polls/votingSlice';
import type { VotingState } from 'features/Polls/votingState';

const mockedVote = vi.fn((payload: unknown) => ({
    payload,
    type: 'voting/vote',
}));
const mockedFindCreatorSessionByPollId = vi.fn();
const mockedFindCreatorSessionByPollSlug = vi.fn();
const mockedRemoveCreatorSession = vi.fn();
const mockedSaveCreatorSession = vi.fn();
const mockedUseGetPollQuery = vi.fn();
const mockedUseClosePollMutation = vi.fn();

vi.mock('features/Polls/votingThunks/vote', () => ({
    vote: (payload: unknown) => mockedVote(payload),
}));

vi.mock('features/Polls/creatorSessionStorage', () => ({
    findCreatorSessionByPollId: (pollId: string) =>
        mockedFindCreatorSessionByPollId(pollId),
    findCreatorSessionByPollSlug: (pollSlug: string) =>
        mockedFindCreatorSessionByPollSlug(pollSlug),
    removeCreatorSession: (pollId: string) =>
        mockedRemoveCreatorSession(pollId),
    saveCreatorSession: (payload: unknown) => mockedSaveCreatorSession(payload),
}));

vi.mock('features/Polls/pollsApi', () => ({
    pollsApi: {
        endpoints: {
            createPoll: {
                matchFulfilled: () => false,
            },
            getPoll: {
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
    slug: 'best-fruit--1111',
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
    publishedDecryptionShares: [],
    resultTallies: [],
    resultScores: [],
};

const renderPoll = (
    preloadedVotingState: VotingState = {},
    initialEntry: string = '/votes/best-fruit--1111',
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

const selectVotingState = (
    state: { voting: VotingState },
    pollId: string,
): VotingState[string] => state.voting[pollId] ?? initialVoteState;

describe('Poll page', () => {
    beforeEach(() => {
        mockedVote.mockClear();
        mockedFindCreatorSessionByPollId.mockReset();
        mockedFindCreatorSessionByPollSlug.mockReset();
        mockedRemoveCreatorSession.mockReset();
        mockedSaveCreatorSession.mockReset();
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
        mockedFindCreatorSessionByPollId.mockReturnValue(null);
        mockedFindCreatorSessionByPollSlug.mockReturnValue(null);
    });

    it('renders workflow failures from state', () => {
        renderPoll({
            '11111111-1111-4111-8111-111111111111': {
                ...initialVoteState,
                workflowError: 'Public key share submission failed.',
            },
        });

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Public key share submission failed.',
        );
    });

    it('renders workflow progress as a polite status message', () => {
        renderPoll({
            '11111111-1111-4111-8111-111111111111': {
                ...initialVoteState,
                progressMessage: 'Waiting for common public key...',
            },
        });

        expect(screen.getByRole('status')).toHaveTextContent(
            'Waiting for common public key...',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders the poll creation date as a YYYY-MM-DD subheading', () => {
        renderPoll();

        expect(screen.getByText('Created 2026-01-01')).toBeVisible();
    });

    it('renders participants as individual list items', () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: {
                ...basePoll,
                voters: ['Alice', 'Bob'],
            },
            error: undefined,
            isLoading: false,
        });

        renderPoll();

        const participantsRegion = screen.getByRole('region', {
            name: 'Participants',
        });
        const participantsList = within(participantsRegion).getByRole('list');

        expect(within(participantsList).getByText('Alice')).toBeVisible();
        expect(within(participantsList).getByText('Bob')).toBeVisible();
    });

    it('shows not found for legacy uuid vote links', () => {
        renderPoll({}, '/votes/11111111-1111-4111-8111-111111111111');

        expect(
            screen.getByRole('heading', { name: 'Page not found' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('/votes/11111111-1111-4111-8111-111111111111'),
        ).toBeInTheDocument();
        expect(mockedUseGetPollQuery).toHaveBeenCalledWith(
            skipToken,
            expect.objectContaining({
                pollingInterval: 5000,
            }),
        );
    });

    it('stops polling once results are available', async () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: {
                ...basePoll,
                encryptedTallies: [
                    {
                        c1: '1',
                        c2: '8',
                    },
                ],
                publishedDecryptionShares: [['1']],
                resultTallies: ['8'],
                resultScores: [8],
            },
            error: undefined,
            isLoading: false,
        });

        renderPoll();

        await waitFor(() => {
            expect(mockedUseGetPollQuery).toHaveBeenLastCalledWith(
                'best-fruit--1111',
                expect.objectContaining({
                    pollingInterval: 0,
                }),
            );
        });
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
        expect(screen.getByRole('status')).toHaveTextContent(
            /The connection to the server was lost\.\s+Showing the latest available vote state and retrying in the background\./i,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByText('TypeError: Failed to fetch'),
        ).not.toBeInTheDocument();
    });

    it('falls back to the persisted poll snapshot when reconnecting offline', () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: undefined,
            error: {
                error: 'TypeError: Failed to fetch',
                status: 'FETCH_ERROR',
            },
            isLoading: false,
        });

        renderPoll({
            '11111111-1111-4111-8111-111111111111': {
                ...initialVoteState,
                pollSlug: 'best-fruit--1111',
                pollSnapshot: basePoll,
            },
        });

        expect(
            screen.getByRole('heading', { name: 'Best fruit' }),
        ).toBeVisible();
        expect(screen.getByRole('status')).toHaveTextContent(
            /The connection to the server was lost\.\s+Showing the latest available vote state and retrying in the background\./i,
        );
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

    it('restores creator controls from the direct creator-session fallback', async () => {
        mockedUseGetPollQuery.mockReturnValue({
            data: {
                ...basePoll,
                isOpen: true,
                voters: ['Alice', 'Bob'],
            },
            error: undefined,
            isLoading: false,
        });
        mockedFindCreatorSessionByPollId.mockReturnValue({
            creatorToken: 'creator-token',
            pollId: basePoll.id,
            pollSlug: basePoll.slug,
        });

        const store = renderPoll();

        await waitFor(() => {
            expect(
                selectVotingState(store.getState(), basePoll.id).creatorToken,
            ).toBe('creator-token');
        });

        expect(
            screen.getByRole('button', { name: 'Begin vote' }),
        ).toBeVisible();
        expect(mockedFindCreatorSessionByPollId).toHaveBeenCalledWith(
            basePoll.id,
        );
    });
});
