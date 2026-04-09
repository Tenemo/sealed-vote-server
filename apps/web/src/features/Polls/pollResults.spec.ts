import {
    hasPublishedResultScores,
    hasPublishedResults,
    orderPublishedPollResults,
} from './pollResults';

describe('hasPublishedResultScores', () => {
    it('returns true only for result score arrays containing finite numbers', () => {
        expect(hasPublishedResultScores(null)).toBe(false);
        expect(hasPublishedResultScores(undefined)).toBe(false);
        expect(hasPublishedResultScores('not-an-array')).toBe(false);
        expect(hasPublishedResultScores([])).toBe(false);
        expect(hasPublishedResultScores([Number.NaN])).toBe(false);
        expect(hasPublishedResultScores([Number.POSITIVE_INFINITY])).toBe(
            false,
        );
        expect(hasPublishedResultScores(['7.25'])).toBe(false);
        expect(hasPublishedResultScores([3.14])).toBe(true);
        expect(hasPublishedResultScores([Number.NaN, 7.25])).toBe(true);
    });
});

describe('hasPublishedResults', () => {
    it('detects whether a poll has published results', () => {
        expect(hasPublishedResults(null)).toBe(false);
        expect(hasPublishedResults({ resultScores: [] })).toBe(false);
        expect(hasPublishedResults({ resultScores: [7.25] })).toBe(true);
    });
});

describe('orderPublishedPollResults', () => {
    it('orders published results by score and preserves original choice order for ties', () => {
        expect(
            orderPublishedPollResults({
                choices: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
                resultScores: [8.5, 8.5, 9.25, 8.5],
            }),
        ).toEqual([
            {
                choiceIndex: 2,
                choiceName: 'Charlie',
                score: 9.25,
            },
            {
                choiceIndex: 0,
                choiceName: 'Alpha',
                score: 8.5,
            },
            {
                choiceIndex: 1,
                choiceName: 'Bravo',
                score: 8.5,
            },
            {
                choiceIndex: 3,
                choiceName: 'Delta',
                score: 8.5,
            },
        ]);
    });

    it('filters out empty choice names and non-finite scores', () => {
        expect(
            orderPublishedPollResults({
                choices: ['Alpha', '', 'Charlie', 'Delta'],
                resultScores: [8.5, 9.5, Number.NaN, Number.POSITIVE_INFINITY],
            }),
        ).toEqual([
            {
                choiceIndex: 0,
                choiceName: 'Alpha',
                score: 8.5,
            },
        ]);
    });
});
