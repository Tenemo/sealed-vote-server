import type { EncryptedMessage, PollResponse } from '@sealed-vote/contracts';
import {
    combineDecryptionShares,
    createDecryptionShare,
    deserializeEncryptedMessage,
    encrypt,
    multiplyEncryptedValues,
    serializeEncryptedMessage,
    thresholdDecrypt,
} from 'threshold-elgamal';

export type PollPhase =
    | 'registration'
    | 'key-generation'
    | 'voting'
    | 'tallying'
    | 'decryption'
    | 'complete';

export const derivePollPhase = (poll: PollResponse): PollPhase => {
    if (poll.isOpen) {
        return 'registration';
    }

    if (!poll.commonPublicKey) {
        return 'key-generation';
    }

    if (poll.results.length > 0) {
        return 'complete';
    }

    if (poll.encryptedTallies.length > 0) {
        return 'decryption';
    }

    if (
        poll.encryptedVotes.length > 0 &&
        poll.encryptedVotes.length >= poll.voters.length
    ) {
        return 'tallying';
    }

    return 'voting';
};

export const canRegister = (poll: PollResponse): boolean =>
    derivePollPhase(poll) === 'registration';

export const canClose = (
    poll: PollResponse,
    voterCount = poll.voters.length,
): boolean => poll.isOpen && voterCount > 1;

export const canSubmitPublicKeyShare = (poll: PollResponse): boolean =>
    derivePollPhase(poll) === 'key-generation';

export const canVote = (poll: PollResponse): boolean =>
    derivePollPhase(poll) === 'voting';

export const canSubmitDecryptionShares = (poll: PollResponse): boolean =>
    derivePollPhase(poll) === 'decryption';

export const computeGeometricMean = (
    results: number[],
    voterCount: number,
): number[] => {
    if (voterCount < 1) {
        throw new Error('Voter count must be greater than 0.');
    }

    return results.map((result) => result ** (1 / voterCount));
};

export const serializeVotes = (
    scores: Record<string, number>,
    choices: string[],
    commonPublicKey: bigint,
): EncryptedMessage[] =>
    choices.map((choice) => {
        const score = scores[choice];
        if (typeof score !== 'number') {
            throw new Error(`Missing score for choice "${choice}".`);
        }

        return serializeEncryptedMessage(encrypt(score, commonPublicKey));
    });

export const createDecryptionSharesForTallies = (
    encryptedTallies: EncryptedMessage[],
    privateKey: bigint,
): string[] =>
    encryptedTallies.map((encryptedTally) =>
        createDecryptionShare(
            deserializeEncryptedMessage(encryptedTally),
            privateKey,
        ).toString(),
    );

export const computeEncryptedTallies = (
    encryptedVotes: EncryptedMessage[][],
): EncryptedMessage[] => {
    if (encryptedVotes.length === 0) {
        return [];
    }

    return encryptedVotes[0].map((_, index) =>
        serializeEncryptedMessage(
            encryptedVotes.reduce(
                (encryptedTally, votes) =>
                    multiplyEncryptedValues(encryptedTally, {
                        c1: BigInt(votes[index].c1),
                        c2: BigInt(votes[index].c2),
                    }),
                { c1: 1n, c2: 1n },
            ),
        ),
    );
};

export const decryptTallies = (
    encryptedTallies: EncryptedMessage[],
    decryptionShares: string[][],
): number[] => {
    if (encryptedTallies.length === 0) {
        return [];
    }

    return encryptedTallies.map((tally, index) =>
        thresholdDecrypt(
            deserializeEncryptedMessage(tally),
            combineDecryptionShares(
                decryptionShares.map((share) => BigInt(share[index])),
            ),
        ),
    );
};
