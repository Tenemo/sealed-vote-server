import type { UnknownAction } from '@reduxjs/toolkit';
import {
    canSubmitDecryptionShares,
    createDecryptionSharesForTallies,
    derivePollPhase,
    serializeVotes,
} from '@sealed-vote/protocol';
import { generateKeys } from 'threshold-elgamal';

import { fetchFreshPoll, waitForPoll } from './pollQuery';
import { pollsApi, type PollResponse } from './pollsApi';
import type { VotingState } from './votingState';
import { selectVoteStateByPollId } from './votingState';

type VotingWorkflowActionCreators = {
    setKeys: (payload: {
        pollId: string;
        privateKey: string;
        publicKey: string;
        commonPublicKey: string | null;
    }) => UnknownAction;
    setProgressMessage: (payload: {
        progressMessage: string | null;
        pollId: string;
    }) => UnknownAction;
    setResults: (payload: {
        results: number[];
        pollId: string;
    }) => UnknownAction;
    setSubmissionStatus: (payload: {
        pollId: string;
        phase: 'publicKey' | 'vote' | 'decryptionShares';
        submitted: boolean;
    }) => UnknownAction;
};

type VotingWorkflowContext = {
    actions: VotingWorkflowActionCreators;
    dispatch: (action: unknown) => unknown;
    getState: () => unknown;
    signal?: AbortSignal;
};

type RootStateLike = {
    voting: VotingState;
};

const getVotingState = (
    getState: () => unknown,
    pollId: string,
): ReturnType<typeof selectVoteStateByPollId> =>
    selectVoteStateByPollId((getState() as RootStateLike).voting, pollId);

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
    pollId,
    predicate,
    signal,
}: {
    pollId: string;
    predicate: (poll: PollResponse) => boolean;
    signal?: AbortSignal;
}): Promise<PollResponse> => waitForPoll({ pollId, predicate, signal });

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
            commonPublicKey: stateCommonPublicKey,
            hasSubmittedPublicKeyShare,
            voterToken,
        } = getVotingState(getState, pollId);

        if (statePrivateKey && statePublicKey && stateCommonPublicKey) {
            return;
        }

        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage: 'Waiting for the vote to be started...',
            }),
        );

        let poll = await fetchFreshPoll(pollId);

        if (derivePollPhase(poll) === 'registration') {
            poll = await waitForPollPhase({
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
                    commonPublicKey: stateCommonPublicKey,
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

            const submitPublicKeyShareResult = dispatch(
                pollsApi.endpoints.submitPublicKeyShare.initiate({
                    pollId,
                    publicKeyShareData: {
                        publicKeyShare: publicKey,
                        voterToken,
                    },
                }),
            ) as {
                unwrap: () => Promise<unknown>;
            };

            await submitPublicKeyShareResult.unwrap();

            dispatch(
                actions.setSubmissionStatus({
                    pollId,
                    phase: 'publicKey',
                    submitted: true,
                }),
            );
        }

        if (poll.commonPublicKey) {
            dispatch(
                actions.setKeys({
                    pollId,
                    privateKey,
                    publicKey,
                    commonPublicKey: poll.commonPublicKey,
                }),
            );
            return;
        }

        dispatch(
            actions.setProgressMessage({
                pollId,
                progressMessage: 'Waiting for common public key...',
            }),
        );

        const pollWithCommonKey = await waitForPollPhase({
            pollId,
            predicate: (currentPoll) => Boolean(currentPoll.commonPublicKey),
            signal,
        });

        dispatch(
            actions.setKeys({
                pollId,
                privateKey,
                publicKey,
                commonPublicKey: pollWithCommonKey.commonPublicKey,
            }),
        );
    } catch (error) {
        throw new Error(
            `Failed during public/private key processing: ${getErrorMessage(error)}`,
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
            commonPublicKey,
            privateKey,
            voterToken,
            hasSubmittedVote,
            hasSubmittedDecryptionShares,
        } = getVotingState(getState, pollId);

        if (!selectedScores || !commonPublicKey || !privateKey || !voterToken) {
            throw new Error('Selected scores missing.');
        }

        const poll = await fetchFreshPoll(pollId);

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
                BigInt(commonPublicKey),
            );

            dispatch(
                actions.setProgressMessage({
                    pollId,
                    progressMessage: 'Submitting encrypted votes...',
                }),
            );

            const submitVoteResult = dispatch(
                pollsApi.endpoints.vote.initiate({
                    pollId,
                    voteData: {
                        votes: encryptedVotes,
                        voterToken,
                    },
                }),
            ) as {
                unwrap: () => Promise<unknown>;
            };

            await submitVoteResult.unwrap();

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

            const submitDecryptionSharesResult = dispatch(
                pollsApi.endpoints.submitDecryptionShares.initiate({
                    pollId,
                    decryptionSharesData: { decryptionShares, voterToken },
                }),
            ) as {
                unwrap: () => Promise<unknown>;
            };

            await submitDecryptionSharesResult.unwrap();

            dispatch(
                actions.setSubmissionStatus({
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
};

export const runDecryptResults = async ({
    pollId,
    dispatch,
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
            pollId,
            predicate: (currentPoll) =>
                derivePollPhase(currentPoll) === 'complete',
            signal,
        });

        dispatch(
            actions.setResults({
                pollId,
                results: poll.results,
            }),
        );
    } catch (error) {
        throw new Error(
            `Failed during result decryption wait: ${getErrorMessage(error)}`,
        );
    }
};
