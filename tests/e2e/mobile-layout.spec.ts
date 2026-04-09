import { expect, test, type Page } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import { gotoInteractablePage } from './support/navigation.mts';
import { createPoll, deletePolls, type CreatedPoll } from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';
import { createPollName, createTestNamespace } from './support/testData';

const mobileViewport = {
    width: 320,
    height: 640,
};

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
    const hasOverflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth > root.clientWidth;
    });

    expect(hasOverflow).toBeFalsy();
};

test('keeps the home page readable and accessible at 320 pixels wide', async ({
    page,
}) => {
    const tracker = createUnexpectedErrorTracker();
    attachErrorTracking(page, 'mobile-home', tracker);

    await page.setViewportSize(mobileViewport);
    await gotoInteractablePage(page, '/');

    await expect(
        page.getByRole('heading', { name: 'Create a new vote' }),
    ).toBeVisible();
    await expect(page.getByLabel('Vote name')).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Add new choice' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Create vote' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, 'mobile home page');
    expectNoUnexpectedErrors(tracker);
});

test('keeps the vote page usable and the score grid reachable at 320 pixels wide', async ({
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);

    attachErrorTracking(page, 'mobile-vote', tracker);

    try {
        await page.setViewportSize(mobileViewport);

        const createdPoll = await createPoll({
            page,
            pollName: createPollName('Mobile layout', namespace),
        });
        createdPolls.push(createdPoll);

        await expect(
            page.getByRole('heading', { name: 'Cast your vote' }),
        ).toBeVisible();
        await expect(
            page.getByRole('radio', { name: 'Score 10 for Apples' }),
        ).toBeVisible();
        await expect(page.getByLabel('Voter name')).toBeVisible();
        await expect(
            page.getByRole('button', { exact: true, name: 'Vote' }),
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page, 'mobile vote page');
        expectNoUnexpectedErrors(tracker);
    } finally {
        await deletePolls(request, createdPolls);
    }
});
