import { expect, test, type TestInfo } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    type CreatedPoll,
} from './support/pollFlow';
import { dropNextPostResponseAfterServerCommit } from './support/network';
import { createPollName, createTestNamespace } from './support/testData';

const localSyntheticDropHosts = new Set(['127.0.0.1', 'localhost']);

const supportsSyntheticPostCommitDrops = (testInfo: TestInfo): boolean => {
    const baseUrl = testInfo.project.use.baseURL;

    if (typeof baseUrl !== 'string') {
        return false;
    }

    try {
        return localSyntheticDropHosts.has(new URL(baseUrl).hostname);
    } catch {
        return false;
    }
};

const skipUnsupportedSyntheticDropScenario = (
    browserName: string,
    testInfo: TestInfo,
): void => {
    test.skip(
        browserName === 'webkit' ||
            testInfo.project.name === 'mobile-firefox-android' ||
            !supportsSyntheticPostCommitDrops(testInfo),
        'This synthetic post-commit transport drop is covered only against the local test backend on desktop Chromium and Firefox.',
    );
};

test('retries poll creation safely after the initial response is lost', async ({
    browserName,
    page,
    request,
}, testInfo) => {
    skipUnsupportedSyntheticDropScenario(browserName, testInfo);

    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Create retry', namespace);

    await gotoInteractablePage(page, '/');
    await page.getByLabel('Vote name').fill(pollName);

    for (const choice of ['Apples', 'Bananas']) {
        await page.getByLabel('Choice to vote for').fill(choice);
        await page.getByRole('button', { name: 'Add new choice' }).click();
    }

    const droppedCreate = await dropNextPostResponseAfterServerCommit({
        page,
        url: /\/api\/polls\/create$/,
    });

    await page.getByRole('button', { name: 'Create vote' }).click();
    await droppedCreate.waitForDrop();

    await expect(page).toHaveURL('/');

    const createPollResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/api/polls/create') &&
            response.ok(),
    );

    await page.getByRole('button', { name: 'Create vote' }).click();

    const createPollResponse = await createPollResponsePromise;
    const createdPoll = (await createPollResponse.json()) as {
        creatorToken: string;
        id: string;
        slug: string;
    };

    createdPolls.push({
        apiBaseUrl: new URL(createPollResponse.url()).origin,
        creatorToken: createdPoll.creatorToken,
        pollId: createdPoll.id,
        pollSlug: createdPoll.slug,
        pollUrl: page.url(),
    });

    await expect(page).toHaveURL(new RegExp(`/votes/${createdPoll.slug}$`));
    await deletePolls(request, createdPolls);
});
