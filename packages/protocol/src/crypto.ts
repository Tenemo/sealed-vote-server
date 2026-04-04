import type { EncryptedMessage } from '@sealed-vote/contracts';
import {
    combineDecryptionShares,
    createDecryptionShare,
    deserializeEncryptedMessage,
    encrypt,
    multiplyEncryptedValues,
    serializeEncryptedMessage,
    thresholdDecrypt,
} from 'threshold-elgamal';

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
