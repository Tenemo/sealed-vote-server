import {
    canSubmitDecryptionShares,
    createDecryptionSharesForTallies,
    derivePollPhase,
    serializeVotes,
} from '@sealed-vote/protocol';
import { generateKeys } from 'threshold-elgamal';

import { fetchFreshPoll, waitForPoll } from './pollQuery';
import { pollsApi, type PollResponse } from './pollsApi';
import { selectVoteStateByPollId } from './votingState';

import { type AppDispatch, type RootState } from 'app/store';
import {
    isConnectionError,
    isConnectionErrorMessage,
} from 'utils/networkErrors';

type VotingWorkflowActionCreators = {
    setKeys: typeof import('./votingSlice').setKeys;
    setProgressMessage: typeof import('./votingSlice').setProgressMessage;
    setSubmissionStatus: typeof import('./votingSlice').setSubmissionStatus;
    upsertPollSnapshot: typeof import('./votingSlice').upsertPollSnapshot;
};

type VotingWorkflowContext = {
    actions: VotingWorkflowActionCreators;
    dispatch: AppDispatch;
    getState: () => RootState;
    signal?: AbortSignal;
};

const getVotingState = (
    getState: () => RootState,
    pollId: string,
): ReturnType<typeof selectVoteStateByPollId> =>
    selectVoteStateByPollId(getState().voting, pollId);

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

const waitForPollPhase = async ({
    dispatch,
    getState,
    pollId,
    predicate,
    signal,
}: {
    dispatch: AppDispatch;
    getState: () => RootState;
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> =>
    await waitForPoll({ dispatch, getState, pollId, predicate, signal });

export const runProcessPublicPrivateKeys = async ({
    pollId,
    dispatch,
    getState,
    signal,
    actions,
}: VotingWorkflowContext & {
    pollId: string;
}): Promise<void> => {
    try {
        const {
            privateKey: statePrivateKey,
            publicKey: statePublicKey,
            pollSnapshot,
            hasSubmittedPublicKeyShare,
            voterToken,
        } = getVotingState(getState, pollId);

        if (
            statePrivateKey &&
            statePublicKey &&
            pollSnapshot?.commonPublicKey
        ) {
            return;
        }

        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage: 'Waiting for the vote to be started...',
            }),
        );

        let poll = await fetchFreshPoll({
            dispatch,
            getState,
            pollId,
        });

        if (derivePollPhase(poll) === 'registration') {
            poll = await waitForPollPhase({
                dispatch,
                getState,
                pollId,
                predicate: (currentPoll) =>
                    derivePollPhase(currentPoll) !== 'registration',
                signal,
            });
        }

        const { voterIndex } = getVotingState(getState, pollId);

        if (!voterIndex || !voterToken) {
            throw new Error('Voter registration is missing.');
        }

        let publicKey = statePublicKey;
        let privateKey = statePrivateKey;

        if (!publicKey || !privateKey) {
            dispatch(
                actions.setProgressMessage({
                    pollId,
                    progressMessage: 'Generating public and private keys...',
                }),
            );

            const generatedKeys = generateKeys(voterIndex, poll.voters.length);
            publicKey = generatedKeys.publicKey.toString();
            privateKey = generatedKeys.privateKey.toString();

            dispatch(
                actions.setKeys({
                    pollId,
                    privateKey,
                    publicKey,
                }),
            );
        }

        if (!hasSubmittedPublicKeyShare) {
            dispatch(
                actions.setProgressMessage({
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
                actions.setSubmissionStatus({
                    pollId,
                    phase: 'publicKey',
                    submitted: true,
                }),
            );
        }

        if (poll.commonPublicKey) {
            dispatch(actions.upsertPollSnapshot({ pollId, poll }));
            return;
        }

        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage: 'Waiting for common public key...',
            }),
        );

        const pollWithCommonKey = await waitForPollPhase({
            dispatch,
            getState,
            pollId,
            predicate: (currentPoll) => Boolean(currentPoll.commonPublicKey),
            signal,
        });

        dispatch(
            actions.upsertPollSnapshot({ pollId, poll: pollWithCommonKey }),
        );
    } catch (error) {
        const message = getErrorMessage(error);
        if (isConnectionError(error) || isConnectionErrorMessage(message)) {
            throw error;
        }

        throw new Error(
            `Failed during public/private key processing: ${message}`,
        );
    }
};

export const runEncryptVotesGenerateShares = async ({
    pollId,
    dispatch,
    getState,
    signal,
    actions,
}: VotingWorkflowContext & {
    pollId: string;
}): Promise<void> => {
    try {
        const {
            selectedScores,
            privateKey,
            voterToken,
            hasSubmittedVote,
            hasSubmittedDecryptionShares,
        } = getVotingState(getState, pollId);

        if (!selectedScores || !privateKey || !voterToken) {
            throw new Error('Selected scores missing.');
        }

        const poll = await fetchFreshPoll({
            dispatch,
            getState,
            pollId,
        });
        if (!poll.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        if (!hasSubmittedVote) {
            dispatch(
                actions.setProgressMessage({
                    pollId,
                    progressMessage: 'Encrypting votes...',
                }),
            );

            const encryptedVotes = serializeVotes(
                selectedScores,
                poll.choices,
                BigInt(poll.commonPublicKey),
            );

            dispatch(
                actions.setProgressMessage({
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
                actions.setSubmissionStatus({
                    pollId,
                    phase: 'vote',
                    submitted: true,
                }),
            );
        }

        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage: 'Waiting for encrypted tallies...',
            }),
        );

        const pollWithTallies = canSubmitDecryptionShares(poll)
            ? poll
            : await waitForPollPhase({
                  dispatch,
                  getState,
                  pollId,
                  predicate: canSubmitDecryptionShares,
                  signal,
              });

        if (!hasSubmittedDecryptionShares) {
            dispatch(
                actions.setProgressMessage({
                    pollId,
                    progressMessage: 'Generating decryption shares...',
                }),
            );

            let decryptionShares: string[];

            try {
                decryptionShares = createDecryptionSharesForTallies(
                    pollWithTallies.encryptedTallies,
                    BigInt(privateKey),
                );
            } catch (error) {
                throw new Error(
                    `Failed to generate decryption shares: ${getErrorMessage(error)}`,
                );
            }

            dispatch(
                actions.setProgressMessage({
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
                actions.setSubmissionStatus({
                    pollId,
                    phase: 'decryptionShares',
                    submitted: true,
                }),
            );
        }
    } catch (error) {
        const message = getErrorMessage(error);
        if (isConnectionError(error) || isConnectionErrorMessage(message)) {
            throw error;
        }

        throw new Error(
            `Failed during vote encryption/decryption-share flow: ${message}`,
        );
    }
};

export const runDecryptResults = async ({
    pollId,
    dispatch,
    getState,
    signal,
    actions,
}: VotingWorkflowContext & {
    pollId: string;
}): Promise<void> => {
    try {
        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage:
                    'Waiting for all decryption shares and results...',
            }),
        );

        const poll = await waitForPollPhase({
            dispatch,
            getState,
            pollId,
            predicate: (currentPoll) =>
                derivePollPhase(currentPoll) === 'complete',
            signal,
        });

        dispatch(actions.upsertPollSnapshot({ pollId, poll }));
    } catch (error) {
        const message = getErrorMessage(error);
        if (isConnectionError(error) || isConnectionErrorMessage(message)) {
            throw error;
        }

        throw new Error(`Failed during result decryption wait: ${message}`);
    }
};
