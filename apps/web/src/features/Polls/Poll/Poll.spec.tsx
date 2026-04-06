import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { act, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import Poll from './Poll';

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
                <MemoryRouter initialEntries={['/votes/poll-1']}>
                    <Routes>
                        <Route element={<Poll />} path="/votes/:pollId" />
                    </Routes>
                </MemoryRouter>
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
            'poll-1': {
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
                pollId: 'poll-1',
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
                    pollId: 'poll-1',
                    selectedScores: { Apples: 7 },
                }),
            );
            store.dispatch(
                setVoterSession({
                    pollId: 'poll-1',
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
            'poll-1': {
                ...initialVoteState,
                workflowError: 'Public key share submission failed.',
            },
        });

        expect(
            screen.getByText('Public key share submission failed.'),
        ).toBeInTheDocument();
    });
});
