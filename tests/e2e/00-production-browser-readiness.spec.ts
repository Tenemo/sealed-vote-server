import { expect, test, type Page } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    type CreatedPoll,
} from './support/poll-flow.ts';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking.ts';

// Keep this file first in the production suite so browser-commit failures show
// up before the heavier multi-page ceremony specs start.
const readinessChoices = ['Readiness alpha', 'Readiness beta'];
const readinessUiTimeoutMs = 30_000;

const expectHomepageReady = async (page: Page): Promise<void> => {
    await expect(page.getByLabel('Poll name')).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(page.getByLabel('Choice name')).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(page.getByRole('button', { name: 'Create poll' })).toBeVisible(
        {
            timeout: readinessUiTimeoutMs,
        },
    );
};

const expectPollPageReady = async (page: Page): Promise<void> => {
    await expect(page.getByLabel('Your public name')).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(
        page.getByText(readinessChoices[0], { exact: true }),
    ).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(page.getByRole('button', { name: 'Submit vote' })).toBeVisible(
        {
            timeout: readinessUiTimeoutMs,
        },
    );
};

test('browser can commit the homepage and a real production poll page', async ({
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    let participantPage: Page | null = null;
    const attachHomepageTracking = createErrorTrackingAttacher({
        label: 'homepage',
        tracker,
    });
    const attachParticipantTracking = createErrorTrackingAttacher({
        label: 'participant-page',
        tracker,
    });

    try {
        page = attachHomepageTracking(page);
        page = attachHomepageTracking(await gotoInteractablePage(page, '/'));
        await expectHomepageReady(page);

        const createdPollResult = await createPoll({
            page,
            pollName: `Production readiness ${test.info().project.name} ${Date.now()}`,
            choices: readinessChoices,
            skipInitialNavigation: true,
        });
        page = attachHomepageTracking(createdPollResult.page);
        const createdPoll = createdPollResult.createdPoll;
        createdPolls.push(createdPoll);

        participantPage = attachParticipantTracking(
            await page.context().newPage(),
        );
        participantPage = attachParticipantTracking(
            await gotoInteractablePage(participantPage, createdPoll.pollUrl),
        );
        await expectPollPageReady(participantPage);
        await expectNoUnexpectedErrors(tracker);
    } finally {
        if (participantPage && !participantPage.isClosed()) {
            await participantPage.close();
        }

        await deletePolls(request, createdPolls);
    }
});
