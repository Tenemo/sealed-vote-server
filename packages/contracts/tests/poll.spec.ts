import { describe, expect, test } from 'vitest';

import { orderVerifiedOptionTallies } from '../src/index.js';

describe('orderVerifiedOptionTallies', () => {
    test('sorts tallies by descending mean and keeps ties stable by option index', () => {
        expect(
            orderVerifiedOptionTallies([
                {
                    acceptedBallotCount: 3,
                    mean: 4.666667,
                    optionIndex: 1,
                    tally: '14',
                },
                {
                    acceptedBallotCount: 3,
                    mean: 6.666667,
                    optionIndex: 3,
                    tally: '20',
                },
                {
                    acceptedBallotCount: 3,
                    mean: 6.666667,
                    optionIndex: 2,
                    tally: '20',
                },
                {
                    acceptedBallotCount: 3,
                    mean: 5.666667,
                    optionIndex: 4,
                    tally: '17',
                },
            ]),
        ).toEqual([
            {
                acceptedBallotCount: 3,
                mean: 6.666667,
                optionIndex: 2,
                tally: '20',
            },
            {
                acceptedBallotCount: 3,
                mean: 6.666667,
                optionIndex: 3,
                tally: '20',
            },
            {
                acceptedBallotCount: 3,
                mean: 5.666667,
                optionIndex: 4,
                tally: '17',
            },
            {
                acceptedBallotCount: 3,
                mean: 4.666667,
                optionIndex: 1,
                tally: '14',
            },
        ]);
    });

    test('keeps zero accepted ballot counts below scored tallies', () => {
        expect(
            orderVerifiedOptionTallies([
                {
                    acceptedBallotCount: 0,
                    mean: 0,
                    optionIndex: 1,
                    tally: '0',
                },
                {
                    acceptedBallotCount: 2,
                    mean: 1,
                    optionIndex: 2,
                    tally: '2',
                },
            ]),
        ).toEqual([
            {
                acceptedBallotCount: 2,
                mean: 1,
                optionIndex: 2,
                tally: '2',
            },
            {
                acceptedBallotCount: 0,
                mean: 0,
                optionIndex: 1,
                tally: '0',
            },
        ]);
    });
});
