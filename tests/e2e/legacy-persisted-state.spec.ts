import { expect, test } from '@playwright/test';

import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';

test('boots with a legacy persisted voting snapshot that predates resultScores', async ({
    page,
}) => {
    const tracker = createUnexpectedErrorTracker();

    attachErrorTracking(page, 'legacy-persisted-state', tracker);

    await page.addInitScript((persistedRoot: string) => {
        window.localStorage.setItem('persist:root', persistedRoot);
    }, JSON.stringify({
        voting: JSON.stringify({
            '11111111-1111-4111-8111-111111111111': {
                pollSlug: 'legacy-rehydration--1111',
                pollSnapshot: {
                    id: '11111111-1111-4111-8111-111111111111',
                    slug: 'legacy-rehydration--1111',
                    pollName: 'Legacy rehydration vote',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    choices: ['Apples', 'Bananas'],
                    voters: ['Alice'],
                    isOpen: true,
                    publicKeyShareCount: 0,
                    encryptedVoteCount: 0,
                    decryptionShareCount: 0,
                    commonPublicKey: null,
                    encryptedTallies: [],
                },
            },
        }),
        _persist: JSON.stringify({
            version: 2,
            rehydrated: true,
        }),
    }));

    await page.goto('/');

    await expect(
        page.getByRole('heading', { name: 'Create a new vote' }),
    ).toBeVisible();

    await expect
        .poll(async () => {
            const persistedRoot = await page.evaluate(() =>
                window.localStorage.getItem('persist:root'),
            );

            if (!persistedRoot) {
                return null;
            }

            const rootState = JSON.parse(persistedRoot) as {
                voting: string;
            };
            const votingState = JSON.parse(rootState.voting) as Record<
                string,
                {
                    pollSnapshot?: {
                        publishedDecryptionShares?: string[][];
                        resultTallies?: string[];
                        resultScores?: number[];
                    };
                }
            >;

            const pollSnapshot =
                votingState['11111111-1111-4111-8111-111111111111']
                    ?.pollSnapshot;

            return pollSnapshot
                ? {
                      publishedDecryptionShares:
                          pollSnapshot.publishedDecryptionShares,
                      resultTallies: pollSnapshot.resultTallies,
                      resultScores: pollSnapshot.resultScores,
                  }
                : null;
        })
        .toEqual({
            publishedDecryptionShares: [],
            resultTallies: [],
            resultScores: [],
        });

    expectNoUnexpectedErrors(tracker);
});
