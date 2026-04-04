export const computeGeometricMean = (
    results: number[],
    voterCount: number,
): number[] => {
    if (voterCount < 1) {
        throw new Error('Voter count must be greater than 0.');
    }

    return results.map((result) => result ** (1 / voterCount));
};
