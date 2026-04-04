import { createAsyncThunk } from '@reduxjs/toolkit';
import { generateKeys } from 'threshold-elgamal';

import { POLLING_DELAY } from './constants';

import { derivePollPhase } from '@sealed-vote/protocol';
import { RootState } from 'app/store';
import { PollResponse, pollsApi } from 'features/Polls/pollsApi';
import {
    selectVotingStateByPollId,
    setKeys,
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

export const processPublicPrivateKeys = createAsyncThunk(
    'voting/processPublicPrivateKeys',
    async ({ pollId }: { pollId: string }, { dispatch, getState }) => {
        try {
            const {
                privateKey: statePrivateKey,
                publicKey: statePublicKey,
                commonPublicKey: stateCommonPublicKey,
                hasSubmittedPublicKeyShare,
                voterToken,
            } = selectVotingStateByPollId(getState() as RootState, pollId);
            if (statePrivateKey && statePublicKey && stateCommonPublicKey) {
                return;
            }

            dispatch(
                setProgressMessage({
                    pollId,
                    progressMessage: 'Waiting for the vote to be started...',
                }),
            );
            let poll: PollResponse | null = null;
            while (!poll || derivePollPhase(poll) === 'registration') {
                poll = await dispatch(
                    pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
                ).unwrap();
                await waitForNextPoll();
            }

            const { voterIndex } = selectVotingStateByPollId(
                getState() as RootState,
                pollId,
            );
            if (!voterIndex || !voterToken) {
                throw new Error('Voter registration is missing.');
            }

            let publicKey = statePublicKey;
            let privateKey = statePrivateKey;

            if (!publicKey || !privateKey) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage:
                            'Generating public and private keys...',
                    }),
                );
                const generatedKeys = generateKeys(
                    voterIndex,
                    poll.voters.length,
                );
                publicKey = generatedKeys.publicKey.toString();
                privateKey = generatedKeys.privateKey.toString();

                dispatch(
                    setKeys({
                        pollId,
                        privateKey,
                        publicKey,
                        commonPublicKey: stateCommonPublicKey,
                    }),
                );
            }

            if (!hasSubmittedPublicKeyShare) {
                dispatch(
                    setProgressMessage({
                        pollId,
                        progressMessage: 'Submitting public key share...',
                    }),
                );
                await dispatch(
                    pollsApi.endpoints.submitPublicKeyShare.initiate({
                        pollId,
                        publicKeyShareData: {
                            publicKeyShare: publicKey,
                            voterToken,
                        },
                    }),
                ).unwrap();

                dispatch(
                    setSubmissionStatus({
                        pollId,
                        phase: 'publicKey',
                        submitted: true,
                    }),
                );
            }

            if (poll.commonPublicKey) {
                dispatch(
                    setKeys({
                        pollId,
                        privateKey,
                        publicKey,
                        commonPublicKey: poll.commonPublicKey,
                    }),
                );
                return;
            }

            dispatch(
                setProgressMessage({
                    pollId,
                    progressMessage: 'Waiting for common public key...',
                }),
            );
            let commonPublicKey: string | null = null;
            while (!commonPublicKey) {
                const pollWithCommonKey = await dispatch(
                    pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
                ).unwrap();

                if (pollWithCommonKey?.commonPublicKey) {
                    commonPublicKey = pollWithCommonKey.commonPublicKey;
                }
                await waitForNextPoll();
            }
            dispatch(
                setKeys({
                    pollId,
                    privateKey,
                    publicKey,
                    commonPublicKey,
                }),
            );
        } catch (error) {
            throw new Error(
                `Failed during public/private key processing: ${getErrorMessage(error)}`,
            );
        }
    },
);
