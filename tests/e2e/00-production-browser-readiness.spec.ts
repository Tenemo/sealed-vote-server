import { expect, test, type Page } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import { createPoll, deletePolls, type CreatedPoll } from './support/pollFlow';

// Keep this file first in the production suite so browser-commit failures show
// up before the heavier multi-page ceremony specs start.
const readinessChoices = ['Readiness alpha', 'Readiness beta'];
const readinessUiTimeoutMs = 30_000;

const expectHomepageReady = async (page: Page): Promise<void> => {
    await expect(page.getByLabel('Vote name')).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(
        page.getByLabel('Choice to vote for'),
    ).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(
        page.getByRole('button', { name: 'Create vote' }),
    ).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
};

const expectVotePageReady = async (page: Page): Promise<void> => {
    await expect(page.getByLabel('Your public name')).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(page.getByText(readinessChoices[0], { exact: true })).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
    await expect(
        page.getByRole('button', { name: 'Submit vote' }),
    ).toBeVisible({
        timeout: readinessUiTimeoutMs,
    });
};

test('browser can commit the homepage and a real production vote page', async ({
    page,
    request,
}) => {
    const createdPolls: CreatedPoll[] = [];
    let participantPage: Page | null = null;

    try {
        await gotoInteractablePage(page, '/');
        await expectHomepageReady(page);

        const createdPoll = await createPoll({
            page,
            pollName: `Production readiness ${test.info().project.name} ${Date.now()}`,
            choices: readinessChoices,
            skipInitialNavigation: true,
        });
        createdPolls.push(createdPoll);

        participantPage = await page.context().newPage();
        await gotoInteractablePage(participantPage, createdPoll.pollUrl);
        await expectVotePageReady(participantPage);
    } finally {
        if (participantPage && !participantPage.isClosed()) {
            await participantPage.close();
        }

        await deletePolls(request, createdPolls);
    }
});
