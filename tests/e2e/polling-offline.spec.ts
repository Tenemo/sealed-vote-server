import { expect, test } from '@playwright/test';

import { createPoll, deletePolls, type CreatedPoll } from './support/pollFlow';
import { createPollName, createTestNamespace } from './support/testData';

test('keeps the vote page usable when polling loses the server connection', async ({
    page,
    request,
}, testInfo) => {
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Offline tolerance', namespace);

    try {
        const createdPoll = await createPoll({
            page,
            pollName,
        });
        createdPolls.push(createdPoll);

        await expect(
            page.getByRole('heading', { name: pollName }),
        ).toBeVisible();

        await page.context().setOffline(true);

        await expect(
            page.locator('[data-slot="connection-toast"]'),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
            page.getByText(
                'Connection to the server was lost. Showing the latest available vote state and retrying in the background.',
            ),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(
            page.getByRole('textbox', { name: 'Vote link' }),
        ).toBeVisible();
        await expect(
            page.getByText('TypeError: Failed to fetch'),
        ).not.toBeVisible();
    } finally {
        await page.context().setOffline(false);
        await deletePolls(request, createdPolls);
    }
});
