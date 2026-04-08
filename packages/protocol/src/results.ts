import type { EncryptedMessage } from '@sealed-vote/contracts';
import DecimalJs from 'decimal.js';

import { decryptTalliesToStrings } from './crypto.js';

export const publishedResultScorePrecision = 6;
export const publishedResultScoreEpsilon = 1e-6;

export const computeGeometricMean = (
    resultTallies: readonly string[],
    voterCount: number,
): number[] => {
    if (voterCount < 1) {
        throw new Error('Voter count must be greater than 0.');
    }

    return resultTallies.map((resultTally) =>
        new DecimalJs(resultTally)
            .pow(new DecimalJs(1).div(voterCount))
            .toDecimalPlaces(publishedResultScorePrecision)
            .toNumber(),
    );
};

export const computePublishedResultScores = (
    resultTallies: readonly string[],
    voterCount: number,
): number[] => computeGeometricMean(resultTallies, voterCount);

const areNumbersClose = (
    left: readonly number[],
    right: readonly number[],
    epsilon: number,
): boolean =>
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]!) <= epsilon);

type VerifyPublishedResultsInput = {
    encryptedTallies: EncryptedMessage[];
    publishedDecryptionShares: string[][];
    resultTallies: readonly string[];
    resultScores: readonly number[];
    voterCount: number;
    scoreEpsilon?: number;
};

export type PublishedResultVerification = {
    computedScores: number[];
    computedTallies: string[];
    isVerified: boolean;
    scoresMatch: boolean;
    talliesMatch: boolean;
};

export const verifyPublishedResults = ({
    encryptedTallies,
    publishedDecryptionShares,
    resultTallies,
    resultScores,
    voterCount,
    scoreEpsilon = publishedResultScoreEpsilon,
}: VerifyPublishedResultsInput): PublishedResultVerification => {
    const computedTallies = decryptTalliesToStrings(
        encryptedTallies,
        publishedDecryptionShares,
    );
    const computedScores = computePublishedResultScores(
        computedTallies,
        voterCount,
    );
    const talliesMatch =
        computedTallies.length === resultTallies.length &&
        computedTallies.every((value, index) => value === resultTallies[index]);
    const scoresMatch = areNumbersClose(
        computedScores,
        resultScores,
        scoreEpsilon,
    );

    return {
        computedScores,
        computedTallies,
        isVerified: talliesMatch && scoresMatch,
        scoresMatch,
        talliesMatch,
    };
};
