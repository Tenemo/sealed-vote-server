import { createAsyncThunk } from '@reduxjs/toolkit';
import { canRegister } from '@sealed-vote/protocol';

import { decryptResults } from './decryptResults';
import { encryptVotesGenerateShares } from './encryptVotesGenerateShares';
import { processPublicPrivateKeys } from './processPublicPrivateKeys';

import { RootState } from 'app/store';
import { pollsApi } from 'features/Polls/pollsApi';
import {
    selectVotingStateByPollId,
    setIsVotingInProgress,
    setProgressMessage,
    setSelectedScores,
    setVoterSession,
} from 'features/Polls/votingSlice';

const formatVotingError = (error: unknown): string => {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown voting error.';
    }
};

export const vote = createAsyncThunk(
    'voting/vote',
    async (
        {
            pollId,
            voterName,
            selectedScores,
        }: {
            pollId: string;
            voterName: string;
            selectedScores: Record<string, number>;
        },
        { getState, dispatch },
    ) => {
        const normalizedVoterName = voterName.trim();

        try {
            const {
                isVotingInProgress,
                voterName: stateVoterName,
                voterIndex: stateVoterIndex,
                voterToken: stateVoterToken,
            } = selectVotingStateByPollId(getState() as RootState, pollId);
            if (isVotingInProgress) {
                return;
            }

            dispatch(
                setIsVotingInProgress({
                    pollId,
                    isVotingInProgress: true,
                }),
            );

            if (!selectedScores || !normalizedVoterName) {
                throw new Error(
                    'Missing required data to participate in the vote.',
                );
            }

            dispatch(
                setSelectedScores({
                    pollId,
                    selectedScores,
                }),
            );

            if (!stateVoterIndex || !stateVoterToken || !stateVoterName) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Registering to vote...',
                    }),
                );

                const poll = await dispatch(
                    pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
                ).unwrap();

                if (!canRegister(poll)) {
                    throw new Error('Poll is closed for new registrations.');
                }

                const registerData = await dispatch(
                    pollsApi.endpoints.registerVoter.initiate({
                        pollId,
                        voterData: { voterName: normalizedVoterName },
                    }),
                ).unwrap();

                dispatch(
                    setVoterSession({
                        pollId,
                        voterIndex: registerData.voterIndex,
                        voterName: registerData.voterName,
                        voterToken: registerData.voterToken,
                    }),
                );
            }

            await dispatch(
                processPublicPrivateKeys({
                    pollId,
                }),
            ).unwrap();

            await dispatch(
                encryptVotesGenerateShares({
                    pollId,
                }),
            ).unwrap();

            await dispatch(
                decryptResults({
                    pollId,
                }),
            ).unwrap();
        } catch (error) {
            console.error('Error voting:', formatVotingError(error));
            throw error;
        } finally {
            dispatch(
                setIsVotingInProgress({
                    pollId,
                    isVotingInProgress: false,
                }),
            );
            dispatch(
                setProgressMessage({
                    pollId,
                    progressMessage: null,
                }),
            );
        }
    },
);
