import { expect, test, type BrowserContext } from '@playwright/test';

import {
    closeVoting,
    createPoll,
    deletePolls,
    expectPostCloseVisible,
    submitVote,
    type CreatedPoll,
} from './support/poll-flow';
import {
    gotoInteractablePage,
    reloadInteractablePage,
} from './support/navigation.mts';
import {
    closeParticipant,
    getProjectContextOptions,
    openProjectParticipant,
} from './support/participants';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/test-data';

test('keeps creator controls after reopening the shared link in a new browser session', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator-initial',
        tracker,
    });
    const attachRestoredTracking = createErrorTrackingAttacher({
        label: 'creator-restored',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Creator resume vote', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    let restoredContext: BrowserContext | null = null;

    try {
        restoredContext = await browser.newContext({
            ...(getProjectContextOptions(testInfo) ?? {}),
            storageState: await page.context().storageState(),
        });
        const restoredPage = attachRestoredTracking(
            await restoredContext.newPage(),
        );
        const resumedPage = attachRestoredTracking(
            await gotoInteractablePage(restoredPage, createdPoll.pollUrl),
        );
        const nextStepPanel = resumedPage
            .getByRole('heading', { name: /your next step/i })
            .locator('xpath=..');

        await expect(
            resumedPage.getByRole('heading', { name: /your next step/i }),
        ).toBeVisible();
        await expect(
            nextStepPanel.getByText(
                'You still need to submit your own vote from this browser before you can close voting.',
                {
                    exact: true,
                },
            ),
        ).toBeVisible();
        await expectNoUnexpectedErrors(tracker);
    } finally {
        if (restoredContext) {
            await restoredContext.close();
        }
        await deletePolls(request, createdPolls);
    }
});

test('restores the securing state after refresh once voting is closed', async ({
    browser,
    browserName,
    page,
    request,
}, testInfo) => {
    test.skip(
        browserName === 'webkit' && process.platform !== 'darwin',
        'Non-macOS Playwright WebKit does not support the Ed25519 and X25519 WebCrypto key generation required for device-backed vote submission.',
    );

    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    const attachRefreshedTracking = createErrorTrackingAttacher({
        label: 'creator-refreshed',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Voter resume vote', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );

        page = attachCreatorTracking(await closeVoting(page));
        page = attachRefreshedTracking(await reloadInteractablePage(page));

        await expectPostCloseVisible(page);
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
