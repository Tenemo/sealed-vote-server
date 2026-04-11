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

test('keeps the poll page usable at 320 pixels wide before voting closes', async ({
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);

    attachErrorTracking(page, 'mobile-poll', tracker);

    try {
        await page.setViewportSize(mobileViewport);
        const pollName = createPollName('Mobile layout', namespace);

        const createdPoll = await createPoll({
            page,
            pollName,
        });
        createdPolls.push(createdPoll);

        await expect(
            page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(page.getByText('Voting open')).toBeVisible();
        await expect(page.getByLabel('Your public name')).toBeVisible();
        await expect(
            page.getByRole('button', { exact: true, name: 'Submit vote' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Your next step' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Audit and verification' }),
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page, 'mobile poll page');
        expectNoUnexpectedErrors(tracker);
    } finally {
        await deletePolls(request, createdPolls);
    }
});
