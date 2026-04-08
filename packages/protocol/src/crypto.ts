import type { EncryptedMessage } from '@sealed-vote/contracts';
import { modInv } from 'bigint-mod-arith';
import {
    combineDecryptionShares,
    createDecryptionShare,
    deserializeEncryptedMessage,
    encrypt,
    getGroup,
    multiplyEncryptedValues,
    serializeEncryptedMessage,
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
): bigint[] => {
    if (encryptedTallies.length === 0) {
        return [];
    }

    const { prime } = getGroup();

    return encryptedTallies.map((tally, index) => {
        const encryptedTally = deserializeEncryptedMessage(tally);
        const combinedShares = combineDecryptionShares(
            decryptionShares.map((share) => BigInt(share[index])),
        );
        const decryptedPlaintext =
            (encryptedTally.c2 * modInv(combinedShares, prime)) % prime;

        return decryptedPlaintext >= 0n
            ? decryptedPlaintext
            : decryptedPlaintext + prime;
    });
};

export const decryptTalliesToStrings = (
    encryptedTallies: EncryptedMessage[],
    decryptionShares: string[][],
): string[] =>
    decryptTallies(encryptedTallies, decryptionShares).map((value) =>
        value.toString(),
    );
