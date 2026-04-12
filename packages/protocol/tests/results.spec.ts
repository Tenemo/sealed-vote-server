import { describe, expect, it } from 'vitest';

import {
    computeArithmeticMean,
    computePublishedResultScores,
    hasVerifiedTallies,
} from '../src/results';

describe('result helpers', () => {
    it('computes arithmetic means from bigint and string tallies', () => {
        expect(computeArithmeticMean(15n, 3)).toBe(5);
        expect(computeArithmeticMean('10', 4)).toBe(2.5);
        expect(computeArithmeticMean('7', 3)).toBe(2.333333);
    });

    it('rejects invalid arithmetic-mean inputs', () => {
        expect(() => computeArithmeticMean('10', 0)).toThrow(
            'Voter count must be greater than zero.',
        );
        expect(() => computeArithmeticMean('not-a-number', 2)).toThrow(
            'Tally must be numeric.',
        );
    });

    it('maps multiple tallies into rounded published scores', () => {
        expect(computePublishedResultScores(['12', '19', '7'], 4)).toEqual([
            3, 4.75, 1.75,
        ]);
    });

    it('reports verified tallies only when the read model is verified', () => {
        expect(
            hasVerifiedTallies({
                verification: {
                    status: 'verified',
                },
            }),
        ).toBe(true);
        expect(
            hasVerifiedTallies({
                verification: {
                    status: 'not-ready',
                },
            }),
        ).toBe(false);
        expect(hasVerifiedTallies(null)).toBe(false);
    });
});
