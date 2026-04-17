import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { orderVerifiedOptionTallies } from '@sealed-vote/contracts';

describe('orderVerifiedOptionTallies', () => {
    test('sorts tallies by descending mean and keeps ties stable by option index', () => {
        assert.deepStrictEqual(
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
            [
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
            ],
        );
    });
});
