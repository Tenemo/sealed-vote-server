import { createAsyncThunk } from '@reduxjs/toolkit';

import { POLLING_DELAY } from './constants';

import { derivePollPhase } from '@sealed-vote/protocol';
import { PollResponse, pollsApi } from 'features/Polls/pollsApi';
import { setProgressMessage, setResults } from 'features/Polls/votingSlice';

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

export const decryptResults = createAsyncThunk(
    'voting/decryptResults',
    async ({ pollId }: { pollId: string }, { dispatch }) => {
        try {
            dispatch(
                setProgressMessage({
                    pollId,
                    progressMessage:
                        'Waiting for all decryption shares and results...',
                }),
            );
            let results: number[] | null = null;
            let poll: PollResponse | null = null;
            while (!results) {
                poll = await dispatch(
                    pollsApi.endpoints.getPollSkipCache.initiate({ pollId }),
                ).unwrap();

                if (poll && derivePollPhase(poll) === 'complete') {
                    results = poll.results;
                }

                await new Promise((resolve) =>
                    setTimeout(resolve, POLLING_DELAY),
                );
            }
            if (!poll) {
                throw new Error('Poll not found.');
            }
            // dispatch(
            //     setProgressMessage({
            //         pollId,
            //         progressMessage:
            //             'Decrypting results and comparing them to the server response.',
            //     }),
            // );
            // let decryptedResults: number[] | null = null;
            // const bigIntEncryptedTallies = poll.encryptedTallies.map(
            //     ({ c1, c2 }) => ({
            //         c1: BigInt(c1),
            //         c2: BigInt(c2),
            //     }),
            // );
            // if (
            //     bigIntEncryptedTallies.length !== poll.decryptionShares.length ||
            //     typeof bigIntEncryptedTallies[0].c1 !== 'bigint'
            // ) {
            //     throw new Error('Mismatched data lengths.');
            // }

            // const combinedDecryptionShares = poll.decryptionShares[0].map(
            //     (_, index) =>
            //         combineDecryptionShares(
            //             poll.decryptionShares.map((shares) =>
            //                 BigInt(shares[index]),
            //             ),
            //         ),
            // );

            // if (
            //     !combinedDecryptionShares ||
            //     combinedDecryptionShares.length !== bigIntEncryptedTallies.length
            // ) {
            //     console.log({ combinedDecryptionShares });
            //     console.log({ 'poll.decryptionShares': poll.decryptionShares });
            //     console.log({ bigIntEncryptedTallies });
            //     throw new Error('Combining decryption shares failure.');
            // }

            // decryptedResults = bigIntEncryptedTallies.map((encryptedTally, index) =>
            //     thresholdDecrypt(encryptedTally, combinedDecryptionShares[index]),
            // );
            // if (
            //     typeof decryptedResults[0] !== 'number' ||
            //     decryptedResults.length !== poll.results.length
            // ) {
            //     throw new Error('Results decryption failure.');
            // }
            // const receivedResults = poll.results;

            // if (
            //     decryptedResults.some(
            //         (result, index) => result !== receivedResults[index],
            //     )
            // ) {
            //     throw new Error('Results do not match.');
            // }

            // dispatch(
            //     setProgressMessage({
            //         pollId,
            //         progressMessage: 'Results decryption complete.',
            //     }),
            // );
            dispatch(
                setResults({
                    pollId,
                    results,
                }),
            );
        } catch (error) {
            throw new Error(
                `Failed during result decryption wait: ${getErrorMessage(error)}`,
            );
        }
    },
);
