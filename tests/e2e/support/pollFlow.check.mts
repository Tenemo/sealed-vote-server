import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createExpectedVerifiedResults,
    parseSubmittedParticipantCount,
    syncPollPageForSharedState,
} from './pollFlow.ts';

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

test('parseSubmittedParticipantCount extracts the ceremony progress count', () => {
    assert.equal(
        parseSubmittedParticipantCount('Submitted participants\n5'),
        5,
    );
});

test('parseSubmittedParticipantCount ignores unrelated text', () => {
    assert.equal(
        parseSubmittedParticipantCount('5 submitted before close'),
        null,
    );
});

test('syncPollPageForSharedState brings the page forward before reloading', async () => {
    const calls: string[] = [];
    const pageDouble = {
        bringToFront: async () => {
            calls.push('front');
        },
    };
    const reloadedPage = {};

    const syncedPage = await syncPollPageForSharedState(
        pageDouble as never,
        async (page) => {
            assert.equal(page, pageDouble);
            calls.push('reload');
            return reloadedPage as never;
        },
    );

    assert.deepEqual(calls, ['front', 'reload']);
    assert.equal(syncedPage, reloadedPage);
});
