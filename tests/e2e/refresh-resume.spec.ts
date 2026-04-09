import { expect, test, type BrowserContext } from '@playwright/test';

import {
    closeParticipant,
    getProjectContextOptions,
    openProjectParticipant,
} from './support/participants';
import {
    beginVote,
    createPoll,
    deletePolls,
    expectResultsVisible,
    joinPoll,
    type CreatedPoll,
} from './support/pollFlow';
import {
    gotoInteractablePage,
    reloadInteractablePage,
} from './support/navigation';
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

test('resumes a persisted voting session after refresh', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Refresh resume vote', namespace),
    });
    createdPolls.push(createdPoll);

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'participant', tracker);

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

        await reloadInteractablePage(participant.page);
        await expect(
            participant.page.getByText('Waiting for the vote to be started...'),
        ).toBeVisible();

        await beginVote(page);

        await expectResultsVisible(page);
        await expectResultsVisible(participant.page);
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});

test('keeps creator controls after reopening the shared link in a new browser session', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'creator-initial', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Creator resume vote', namespace),
    });
    createdPolls.push(createdPoll);

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'participant', tracker);
    let restoredContext: BrowserContext | null = null;

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

        restoredContext = await browser.newContext({
            ...(getProjectContextOptions(testInfo) ?? {}),
            storageState: await page.context().storageState(),
        });
        const restoredPage = await restoredContext.newPage();
        attachErrorTracking(restoredPage, 'creator-restored', tracker);
        await gotoInteractablePage(restoredPage, createdPoll.pollUrl);

        const beginVoteButton = restoredPage.getByRole('button', {
            name: 'Begin vote',
        });
        await expect(beginVoteButton).toBeVisible();
        await expect(beginVoteButton).toBeEnabled();
        expectNoUnexpectedErrors(tracker);
    } finally {
        if (restoredContext) {
            await restoredContext.close();
        }
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
