import assert from 'node:assert/strict';
import test from 'node:test';

import { createExpectedVerifiedResults } from './pollFlow.ts';

test('createExpectedVerifiedResults derives displayed tallies per choice', () => {
    assert.deepEqual(
        createExpectedVerifiedResults({
            choices: ['Apples', 'Bananas', 'Cherries'],
            scorecards: [
                [10, 4, 7],
                [6, 8, 5],
                [8, 6, 9],
            ],
        }),
        [
            {
                acceptedBallotCount: 3,
                choice: 'Apples',
                displayedMean: '8.00',
                tally: '24',
            },
            {
                acceptedBallotCount: 3,
                choice: 'Bananas',
                displayedMean: '6.00',
                tally: '18',
            },
            {
                acceptedBallotCount: 3,
                choice: 'Cherries',
                displayedMean: '7.00',
                tally: '21',
            },
        ],
    );
});

test('createExpectedVerifiedResults rejects missing scores', () => {
    assert.throws(
        () =>
            createExpectedVerifiedResults({
                choices: ['Apples', 'Bananas'],
                scorecards: [[9]],
            }),
        /Missing or invalid score/u,
    );
});
