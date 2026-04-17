import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bringPollPagesToFront,
    createExpectedVerifiedResults,
    parseCeremonyMetricValue,
    parseSubmittedParticipantCount,
    syncPollPagesForSharedState,
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

test('parseCeremonyMetricValue extracts the exact metric value', () => {
    assert.equal(
        parseCeremonyMetricValue({
            label: 'Board registrations',
            rowText: 'Board registrations16',
        }),
        '16',
    );
});

test('parseCeremonyMetricValue ignores unrelated text', () => {
    assert.equal(
        parseCeremonyMetricValue({
            label: 'Board registrations',
            rowText: 'Submitted participants 16',
        }),
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

test('syncPollPagesForSharedState reloads each page and reapplies attachers', async () => {
    const calls: string[] = [];
    const pageOne = {
        bringToFront: async () => {
            calls.push('front-one');
        },
    };
    const pageTwo = {
        bringToFront: async () => {
            calls.push('front-two');
        },
    };
    const reloadedPageOne = { label: 'page-one' };
    const reloadedPageTwo = { label: 'page-two' };

    const syncedPages = await syncPollPagesForSharedState({
        attachPages: [
            (page) => {
                calls.push(
                    `attach-${(page as unknown as typeof reloadedPageOne).label}`,
                );
                return page;
            },
            undefined,
        ],
        pages: [pageOne as never, pageTwo as never],
        reloadPage: async (page) => {
            if (page === pageOne) {
                calls.push('reload-one');
                return reloadedPageOne as never;
            }

            calls.push('reload-two');
            return reloadedPageTwo as never;
        },
    });

    assert.deepEqual(calls, [
        'front-one',
        'reload-one',
        'attach-page-one',
        'front-two',
        'reload-two',
    ]);
    assert.deepEqual(syncedPages, [reloadedPageOne, reloadedPageTwo]);
});

test('bringPollPagesToFront focuses each page and reapplies attachers', async () => {
    const calls: string[] = [];
    const pageOne = {
        bringToFront: async () => {
            calls.push('front-one');
        },
    };
    const pageTwo = {
        bringToFront: async () => {
            calls.push('front-two');
        },
    };

    const focusedPages = await bringPollPagesToFront({
        attachPages: [
            (page) => {
                calls.push('attach-one');
                return page;
            },
            undefined,
        ],
        pages: [pageOne as never, pageTwo as never],
    });

    assert.deepEqual(calls, ['front-one', 'attach-one', 'front-two']);
    assert.deepEqual(focusedPages, [pageOne, pageTwo]);
});
