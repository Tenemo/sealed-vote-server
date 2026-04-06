import { expect, test } from '@playwright/test';

test('completes the two-voter happy path in the browser', async ({
    browser,
    page,
}) => {
    const unexpectedBrowserErrors: string[] = [];

    const attachErrorTracking = (
        trackedPage: typeof page,
        label: string,
    ): void => {
        trackedPage.on('console', (message) => {
            if (message.type() === 'error') {
                unexpectedBrowserErrors.push(
                    `[${label}] console: ${message.text()}`,
                );
            }
        });
        trackedPage.on('pageerror', (error) => {
            unexpectedBrowserErrors.push(`[${label}] pageerror: ${error.message}`);
        });
        trackedPage.on('response', (response) => {
            if (response.url().includes('/api/') && response.status() >= 400) {
                unexpectedBrowserErrors.push(
                    `[${label}] response: ${response.status()} ${response.url()}`,
                );
            }
        });
    };

    attachErrorTracking(page, 'page-1');

    await page.goto('/');

    await page.getByLabel('Vote name').fill(`E2E vote ${Date.now()}`);
    await page.getByLabel('Choice to vote for').fill('Apples');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByLabel('Choice to vote for').fill('Bananas');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByRole('button', { name: 'Create vote' }).click();

    await expect(page).toHaveURL(/\/votes\/[a-z0-9-]+--[0-9a-f]{8,32}$/);
    const pollUrl = page.url();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    attachErrorTracking(secondPage, 'page-2');
    await secondPage.goto(pollUrl);

    await page.getByLabel('Voter name*').fill('Alice');
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();

    await secondPage.getByLabel('Voter name*').fill('Bob');
    await secondPage
        .getByRole('button', { exact: true, name: 'Vote' })
        .click();

    const beginVoteButton = page.getByRole('button', { name: 'Begin vote' });
    await expect(beginVoteButton).toBeEnabled({ timeout: 30_000 });
    await beginVoteButton.click();

    await expect(
        page.getByRole('heading', { name: 'Results' }),
    ).toBeVisible({ timeout: 120_000 });
    await expect(secondPage.getByRole('heading', { name: 'Results' })).toBeVisible({
        timeout: 120_000,
    });
    await expect(page.getByText('Voters in this poll: Alice, Bob')).toBeVisible();
    expect(unexpectedBrowserErrors).toEqual([]);

    await secondContext.close();
});
