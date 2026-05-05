import { expect, test, type Page } from '@playwright/test';

import { expectNoAccessibilityViolations } from './support/accessibility.ts';
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
import { createPollName, createTestNamespace } from './support/test-data.ts';

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
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const attachMobileHomeTracking = createErrorTrackingAttacher({
        label: 'mobile-home',
        tracker,
    });

    page = attachMobileHomeTracking(page);

    await page.setViewportSize(mobileViewport);
    page = attachMobileHomeTracking(await gotoInteractablePage(page, '/'));

    await expect(
        page.getByRole('heading', { name: 'Create a new poll' }),
    ).toBeVisible();
    await expect(page.getByLabel('Poll name')).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Add new choice' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Create poll' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAccessibilityViolations(page, 'mobile home page');
    await expectNoUnexpectedErrors(tracker);
});

test('keeps the poll page usable at 320 pixels wide before voting closes', async ({
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const attachMobilePollTracking = createErrorTrackingAttacher({
        label: 'mobile-poll',
        tracker,
    });

    try {
        page = attachMobilePollTracking(page);
        await page.setViewportSize(mobileViewport);
        const pollName = createPollName('Mobile layout', namespace);

        const createdPollResult = await createPoll({
            attachPage: attachMobilePollTracking,
            page,
            pollName,
        });
        page = attachMobilePollTracking(createdPollResult.page);
        const createdPoll = createdPollResult.createdPoll;
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
        await expectNoAccessibilityViolations(page, 'mobile poll page');
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await deletePolls(request, createdPolls);
    }
});
