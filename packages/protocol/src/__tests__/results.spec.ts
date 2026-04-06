import { describe, expect, test } from 'vitest';

import { computeGeometricMean } from '../results';

describe('computeGeometricMean', () => {
    test('computes geometric means using the voter count', () => {
        const [firstResult, secondResult] = computeGeometricMean(
            [1000, 125],
            3,
        );

        expect(firstResult).toBeCloseTo(10);
        expect(secondResult).toBeCloseTo(5);
    });

    test('throws for empty voter counts', () => {
        expect(() => computeGeometricMean([10], 0)).toThrow(
            'Voter count must be greater than 0.',
        );
    });

    test('leaves one-voter results unchanged', () => {
        expect(computeGeometricMean([4, 9, 16], 1)).toEqual([4, 9, 16]);
    });
});
