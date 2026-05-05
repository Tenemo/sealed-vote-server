import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bringPollPagesToFront,
    createExpectedVerifiedResults,
    parseCeremonyMetricValue,
    parseSubmittedVoterCount,
    resolveRecoveredPollApiBaseUrl,
    syncPollPagesForSharedState,
    syncPollPageForSharedState,
    waitForPollPageState,
} from './poll-flow.ts';

test('createExpectedVerifiedResults derives displayed tallies in score order', () => {
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
                choice: 'Cherries',
                displayedMean: '7.00',
                tally: '21',
            },
            {
                acceptedBallotCount: 3,
                choice: 'Bananas',
                displayedMean: '6.00',
                tally: '18',
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

test('parseSubmittedVoterCount extracts the ceremony progress count', () => {
    assert.equal(parseSubmittedVoterCount('Submitted voters\n5'), 5);
});

test('parseSubmittedVoterCount ignores unrelated text', () => {
    assert.equal(parseSubmittedVoterCount('5 submitted before close'), null);
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
            rowText: 'Submitted voters 16',
        }),
        null,
    );
});

test('resolveRecoveredPollApiBaseUrl prefers the configured api origin for local recovered polls', () => {
    assert.equal(
        resolveRecoveredPollApiBaseUrl(
            'http://127.0.0.1:4173/polls/example--1234',
            'http://127.0.0.1:4000/api/ignored',
        ),
        'http://127.0.0.1:4000',
    );
});

test('resolveRecoveredPollApiBaseUrl infers the production api origin when no override is configured', () => {
    assert.equal(
        resolveRecoveredPollApiBaseUrl(
            'https://sealed.vote/polls/example--1234',
            undefined,
        ),
        'https://api.sealed.vote',
    );
});

test('syncPollPageForSharedState brings a live remote page forward before reloading', async () => {
    const calls: string[] = [];
    const pageDouble = {
        bringToFront: async () => {
            calls.push('front');
        },
        url: () => 'https://sealed.vote/polls/example--1234',
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

test('syncPollPageForSharedState skips the hard reload on local ci origins', async () => {
    const calls: string[] = [];
    const pageDouble = {
        bringToFront: async () => {
            calls.push('front');
        },
        url: () => 'http://127.0.0.1:3000/polls/example--1234',
    };

    const syncedPage = await syncPollPageForSharedState(
        pageDouble as never,
        async () => {
            calls.push('reload');
            throw new Error('reload should not be called for local ci pages');
        },
    );

    assert.deepEqual(calls, ['front']);
    assert.equal(syncedPage, pageDouble);
});

test('syncPollPagesForSharedState reloads only live remote pages and reapplies attachers', async () => {
    const calls: string[] = [];
    const pageOne = {
        bringToFront: async () => {
            calls.push('front-one');
        },
        url: () => 'https://sealed.vote/polls/page-one',
    };
    const pageTwo = {
        bringToFront: async () => {
            calls.push('front-two');
        },
        url: () => 'http://127.0.0.1:3000/polls/page-two',
    };
    const reloadedPageOne = { label: 'page-one' };

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
            throw new Error('local ci pages should not be hard reloaded');
        },
    });

    assert.deepEqual(calls, [
        'front-one',
        'reload-one',
        'attach-page-one',
        'front-two',
    ]);
    assert.deepEqual(syncedPages, [reloadedPageOne, pageTwo]);
});

test('waitForPollPageState retries with a hard reload for live remote pages', async () => {
    const calls: string[] = [];
    const pageDouble = {
        bringToFront: async () => {
            calls.push('front-original');
        },
        url: () => 'https://sealed.vote/polls/example--1234',
    };
    const reloadedPage = {
        bringToFront: async () => {
            calls.push('front-reloaded');
        },
        url: () => 'https://sealed.vote/polls/example--1234',
    };

    const resolvedPage = await waitForPollPageState({
        page: pageDouble as never,
        reloadPage: async (page) => {
            assert.equal(page, pageDouble);
            calls.push('reload');
            return reloadedPage as never;
        },
        timeout: 60_000,
        waitForState: async (page, timeout) => {
            if (page === pageDouble) {
                calls.push(`wait-original-${timeout}`);
                throw new Error('stale shared state');
            }

            assert.equal(page, reloadedPage);
            calls.push(`wait-reloaded-${timeout}`);
        },
    });

    assert.deepEqual(calls, [
        'front-original',
        'wait-original-30000',
        'reload',
        'front-reloaded',
        'wait-reloaded-60000',
    ]);
    assert.equal(resolvedPage, reloadedPage);
});

test('waitForPollPageState rethrows the original failure on local loopback pages', async () => {
    const calls: string[] = [];
    const pageDouble = {
        bringToFront: async () => {
            calls.push('front');
        },
        url: () => 'http://127.0.0.1:3000/polls/example--1234',
    };
    const expectedError = new Error('missing ceremony metric');

    await assert.rejects(
        async () =>
            await waitForPollPageState({
                page: pageDouble as never,
                reloadPage: async () => {
                    calls.push('reload');
                    throw new Error('local loopback pages should not reload');
                },
                timeout: 60_000,
                waitForState: async (page, timeout) => {
                    assert.equal(page, pageDouble);
                    calls.push(`wait-${timeout}`);
                    throw expectedError;
                },
            }),
        (error) => {
            assert.equal(error, expectedError);
            return true;
        },
    );

    assert.deepEqual(calls, ['front', 'wait-60000']);
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
