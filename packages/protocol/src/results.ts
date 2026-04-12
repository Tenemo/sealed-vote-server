import type { PollResponse } from '@sealed-vote/contracts';

const roundMean = (value: number): number =>
    Number.parseFloat(value.toFixed(6));

export const computeArithmeticMean = (
    resultTally: bigint | string,
    voterCount: number,
): number => {
    if (voterCount <= 0) {
        throw new Error('Voter count must be greater than zero.');
    }

    const tally =
        typeof resultTally === 'bigint'
            ? Number(resultTally)
            : Number(resultTally);

    if (!Number.isFinite(tally)) {
        throw new Error('Tally must be numeric.');
    }

    return roundMean(tally / voterCount);
};

export const computePublishedResultScores = (
    resultTallies: readonly string[],
    voterCount: number,
): number[] =>
    resultTallies.map((resultTally) =>
        computeArithmeticMean(resultTally, voterCount),
    );

export const hasVerifiedTallies = (
    poll: Pick<PollResponse, 'verification'> | null | undefined,
): boolean => poll?.verification.status === 'verified';
