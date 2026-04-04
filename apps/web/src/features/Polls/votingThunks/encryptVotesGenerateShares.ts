import { createAsyncThunk } from '@reduxjs/toolkit';

import { POLLING_DELAY } from './constants';

import {
    canSubmitDecryptionShares,
    createDecryptionSharesForTallies,
    serializeVotes,
} from '@sealed-vote/protocol';
import { RootState } from 'app/store';
import { PollResponse, pollsApi } from 'features/Polls/pollsApi';
import {
    selectVotingStateByPollId,
    setProgressMessage,
    setSubmissionStatus,
} from 'features/Polls/votingSlice';

const waitForNextPoll = async (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, POLLING_DELAY));

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown error.';
    }
};

export const encryptVotesGenerateShares = createAsyncThunk(
    'voting/decryptResults',
    async ({ pollId }: { pollId: string }, { dispatch, getState }) => {
        try {
            const {
                selectedScores,
                commonPublicKey,
                privateKey,
                voterToken,
                hasSubmittedVote,
                hasSubmittedDecryptionShares,
            } = selectVotingStateByPollId(getState() as RootState, pollId);
            if (
                !selectedScores ||
                !commonPublicKey ||
                !privateKey ||
                !voterToken
            ) {
                throw new Error('Selected scores missing.');
            }

            let poll = await dispatch(
                pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
            ).unwrap();

            if (!hasSubmittedVote) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Encrypting votes...',
                    }),
                );
                const encryptedVotes = serializeVotes(
                    selectedScores,
                    poll.choices,
                    BigInt(commonPublicKey),
                );

                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Submitting encrypted votes...',
                    }),
                );
                await dispatch(
                    pollsApi.endpoints.vote.initiate({
                        pollId,
                        voteData: {
                            votes: encryptedVotes,
                            voterToken,
                        },
                    }),
                ).unwrap();

                dispatch(
                    setSubmissionStatus({
                        pollId,
                        phase: 'vote',
                        submitted: true,
                    }),
                );
            }

            dispatch(
                setProgressMessage({
                    pollId,
                    progressMessage: 'Waiting for encrypted tallies...',
                }),
            );
            let encryptedTallies: PollResponse['encryptedTallies'] | null =
                poll.encryptedTallies.length > 0 ? poll.encryptedTallies : null;
            while (!encryptedTallies) {
                poll = await dispatch(
                    pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
                ).unwrap();
                if (canSubmitDecryptionShares(poll)) {
                    encryptedTallies = poll.encryptedTallies;
                }
                await waitForNextPoll();
            }

            if (!hasSubmittedDecryptionShares) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Generating decryption shares...',
                    }),
                );
                let decryptionShares: string[];

                try {
                    decryptionShares = createDecryptionSharesForTallies(
                        encryptedTallies,
                        BigInt(privateKey),
                    );
                } catch (error) {
                    throw new Error(
                        `Failed to generate decryption shares: ${getErrorMessage(error)}`,
                    );
                }

                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Submitting decryption shares...',
                    }),
                );
                await dispatch(
                    pollsApi.endpoints.submitDecryptionShares.initiate({
                        pollId,
                        decryptionSharesData: { decryptionShares, voterToken },
                    }),
                ).unwrap();

                dispatch(
                    setSubmissionStatus({
                        pollId,
                        phase: 'decryptionShares',
                        submitted: true,
                    }),
                );
            }
        } catch (error) {
            throw new Error(
                `Failed during vote encryption/decryption-share flow: ${getErrorMessage(error)}`,
            );
        }
    },
);
