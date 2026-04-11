import { expect, test, type BrowserContext } from '@playwright/test';

import {
    closeVoting,
    createPoll,
    deletePolls,
    expectSecuringVisible,
    submitVote,
    type CreatedPoll,
} from './support/pollFlow';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    closeParticipant,
    getProjectContextOptions,
    openProjectParticipant,
} from './support/participants';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/testData';

test('keeps creator controls after reopening the shared link in a new browser session', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);

    attachErrorTracking(page, 'creator-initial', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Creator resume vote', namespace),
    });
    createdPolls.push(createdPoll);

    let restoredContext: BrowserContext | null = null;

    try {
        restoredContext = await browser.newContext({
            ...(getProjectContextOptions(testInfo) ?? {}),
            storageState: await page.context().storageState(),
        });
        const restoredPage = await restoredContext.newPage();
        attachErrorTracking(restoredPage, 'creator-restored', tracker);
        await gotoInteractablePage(restoredPage, createdPoll.pollUrl);
        const nextStepPanel = restoredPage
            .getByRole('heading', { name: /your next step/i })
            .locator('xpath=..');

        await expect(
            restoredPage.getByRole('heading', { name: /your next step/i }),
        ).toBeVisible();
        await expect(
            nextStepPanel.getByText(
                'You still need to submit your own vote from this browser before you can close voting.',
                {
                    exact: true,
                },
            ),
        ).toBeVisible();
        expectNoUnexpectedErrors(tracker);
    } finally {
        if (restoredContext) {
            await restoredContext.close();
        }
        await deletePolls(request, createdPolls);
    }
});

test('restores the securing state after refresh once voting is closed', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Voter resume vote', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    let restoredContext: BrowserContext | null = null;

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });

        await closeVoting(page);

        restoredContext = await browser.newContext({
            ...(getProjectContextOptions(testInfo) ?? {}),
            storageState: await page.context().storageState(),
        });
        const restoredPage = await restoredContext.newPage();
        attachErrorTracking(restoredPage, 'creator-restored', tracker);
        await gotoInteractablePage(restoredPage, createdPoll.pollUrl);

        await expectSecuringVisible(restoredPage);
        expectNoUnexpectedErrors(tracker);
    } finally {
        if (restoredContext) {
            await restoredContext.close();
        }
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
