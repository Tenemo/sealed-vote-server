import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import RecoveryCoordinator from './RecoveryCoordinator';

import { initialVoteState, votingSlice } from 'features/Polls/votingSlice';
import type { VotingState } from 'features/Polls/votingState';

const mockedRecoverSession = vi.fn((payload: unknown) => ({
    payload,
}));
const mockedVote = vi.fn((payload: unknown) => ({
    payload,
}));

vi.mock('features/Polls/votingThunks/recoverSession', () => ({
    recoverSession: (payload: unknown) => {
        mockedRecoverSession(payload);

        return async (): Promise<void> => undefined;
    },
}));

vi.mock('features/Polls/votingThunks/vote', () => ({
    vote: (payload: unknown) => {
        mockedVote(payload);

        return async (): Promise<void> => undefined;
    },
}));

const renderCoordinator = (preloadedVotingState: VotingState): void => {
    const store = configureStore({
        preloadedState: {
            voting: preloadedVotingState,
        },
        reducer: {
            voting: votingSlice.reducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: false,
            }),
    });

    render(
        <Provider store={store}>
            <RecoveryCoordinator />
        </Provider>,
    );
};

describe('RecoveryCoordinator', () => {
    beforeEach(() => {
        mockedRecoverSession.mockClear();
        mockedVote.mockClear();
    });

    it('retries pending voter registration before falling back to creator recovery', async () => {
        renderCoordinator({
            'poll-1': {
                ...initialVoteState,
                creatorToken: 'creator-token',
                pendingVoterName: 'Alice',
                pendingVoterToken: 'pending-voter-token',
                pollSlug: 'best-fruit--1111',
                selectedScores: { Apples: 7 },
            },
        });

        await waitFor(() => {
            expect(mockedVote).toHaveBeenCalledWith({
                pollId: 'poll-1',
                voterName: 'Alice',
                selectedScores: { Apples: 7 },
            });
        });
        expect(mockedRecoverSession).not.toHaveBeenCalled();
    });

    it('retries confirmed voter sessions through recoverSession when workflow resume is needed', async () => {
        renderCoordinator({
            'poll-1': {
                ...initialVoteState,
                pollSlug: 'best-fruit--1111',
                selectedScores: { Apples: 7 },
                shouldResumeWorkflow: true,
                voterName: 'Alice',
                voterIndex: 0,
                voterToken: 'voter-token',
            },
        });

        await waitFor(() => {
            expect(mockedRecoverSession).toHaveBeenCalledWith({
                pollId: 'poll-1',
            });
        });
        expect(mockedVote).not.toHaveBeenCalled();
    });

    it('retries persisted registered voter sessions even before the resume flag is rebuilt', async () => {
        renderCoordinator({
            'poll-1': {
                ...initialVoteState,
                pollSlug: 'best-fruit--1111',
                selectedScores: { Apples: 7 },
                voterName: 'Alice',
                voterIndex: 0,
                voterToken: 'voter-token',
            },
        });

        await waitFor(() => {
            expect(mockedRecoverSession).toHaveBeenCalledWith({
                pollId: 'poll-1',
            });
        });
        expect(mockedVote).not.toHaveBeenCalled();
    });
});
