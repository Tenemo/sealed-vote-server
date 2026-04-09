import { expect, test, type TestInfo } from '@playwright/test';

import {
    beginVote,
    createPoll,
    deletePolls,
    expectConnectionToastHidden,
    expectParticipantsVisible,
    expectResultsVisible,
    joinPoll,
    type CreatedPoll,
} from './support/pollFlow';
import { gotoInteractablePage } from './support/navigation';
import {
    dropNextPostResponseAfterServerCommit,
    failPollFetches,
} from './support/network';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/testData';

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
        'This synthetic post-commit transport drop is only covered against the local test backend on desktop Chromium and Firefox.',
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

    await expect(page).toHaveURL(new RegExp(`/votes/${createdPoll.slug}$`));

    createdPolls.push({
        apiBaseUrl: new URL(createPollResponse.url()).origin,
        creatorToken: createdPoll.creatorToken,
        pollId: createdPoll.id,
        pollSlug: createdPoll.slug,
        pollUrl: page.url(),
    });

    await deletePolls(request, createdPolls);
});

test('recovers automatically when voter registration commits but the response is lost', async ({
    browserName,
    page,
    request,
}, testInfo) => {
    skipUnsupportedSyntheticDropScenario(browserName, testInfo);

    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const voterName = createVoterName('alice', namespace);

    try {
        const createdPoll = await createPoll({
            page,
            pollName: createPollName('Register retry', namespace),
        });
        createdPolls.push(createdPoll);

        const droppedRegistration = await dropNextPostResponseAfterServerCommit(
            {
                page,
                url: /\/api\/polls\/[^/]+\/register$/,
            },
        );

        await page.getByLabel('Voter name').fill(voterName);
        await page.getByRole('button', { exact: true, name: 'Vote' }).click();

        await droppedRegistration.waitForDrop();

        await expect(
            page.getByText('Waiting for the vote to be started...'),
        ).toBeVisible({ timeout: 30_000 });
        await expectParticipantsVisible(page, [voterName]);
    } finally {
        await deletePolls(request, createdPolls);
    }
});

test('recovers from lost close and phase-submission responses without manual intervention', async ({
    browserName,
    browser,
    page,
    request,
}, testInfo) => {
    skipUnsupportedSyntheticDropScenario(browserName, testInfo);

    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantName = createVoterName('bob', namespace);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Phase retry', namespace),
    });
    createdPolls.push(createdPoll);

    const participant = await openProjectParticipant(browser, testInfo);

    try {
        await joinPoll({
            page,
            voterName: creatorName,
        });
        await joinPoll({
            page: participant.page,
            pollUrl: createdPoll.pollUrl,
            voterName: participantName,
        });

        const droppedClose = await dropNextPostResponseAfterServerCommit({
            page,
            url: /\/api\/polls\/[^/]+\/close$/,
        });
        const droppedPublicKeyShare =
            await dropNextPostResponseAfterServerCommit({
                page: participant.page,
                url: /\/api\/polls\/[^/]+\/public-key-share$/,
            });
        const droppedVote = await dropNextPostResponseAfterServerCommit({
            page,
            url: /\/api\/polls\/[^/]+\/vote$/,
        });
        const droppedDecryptionShares =
            await dropNextPostResponseAfterServerCommit({
                page: participant.page,
                url: /\/api\/polls\/[^/]+\/decryption-shares$/,
            });

        await beginVote(page);

        await droppedClose.waitForDrop();
        await droppedPublicKeyShare.waitForDrop();
        await droppedVote.waitForDrop();
        await droppedDecryptionShares.waitForDrop();

        await expectResultsVisible(page);
        await expectResultsVisible(participant.page);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});

test('reopens a previously visited poll from persisted local data when poll fetches fail', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const voterName = createVoterName('alice', namespace);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Snapshot reopen', namespace),
    });
    createdPolls.push(createdPoll);

    await joinPoll({
        page,
        voterName,
    });

    const snapshotContext = await browser.newContext({
        storageState: await page.context().storageState(),
    });
    const snapshotPage = await snapshotContext.newPage();

    try {
        const stopFailingPollFetches = await failPollFetches({
            page: snapshotPage,
            url: /\/api\/polls\/[^/]+$/,
        });

        await gotoInteractablePage(snapshotPage, createdPoll.pollUrl);

        await expect(
            snapshotPage.getByRole('heading', {
                name: createPollName('Snapshot reopen', namespace),
            }),
        ).toBeVisible({ timeout: 30_000 });

        await stopFailingPollFetches();
        await expectConnectionToastHidden(snapshotPage);
        await expectParticipantsVisible(snapshotPage, [voterName]);
    } finally {
        await snapshotContext.close();
        await deletePolls(request, createdPolls);
    }
});
