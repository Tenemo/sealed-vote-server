import { expect, test } from '@playwright/test';

test('completes the two-voter happy path in the browser', async ({
    browser,
    page,
}) => {
    page.on('console', (message) => {
        if (message.type() === 'error') {
            console.log('[page-1 console]', message.text());
        }
    });
    page.on('pageerror', (error) => {
        console.log('[page-1 error]', error.message);
    });
    page.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) {
            console.log('[page-1 response]', response.status(), response.url());
        }
    });

    await page.goto('/');

    await page.getByLabel('Vote name').fill(`E2E vote ${Date.now()}`);
    await page.getByLabel('Choice to vote for').fill('Apples');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByLabel('Choice to vote for').fill('Bananas');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByRole('button', { name: 'Create vote' }).click();

    await expect(page).toHaveURL(/\/votes\/.+/);
    const pollUrl = page.url();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    secondPage.on('console', (message) => {
        if (message.type() === 'error') {
            console.log('[page-2 console]', message.text());
        }
    });
    secondPage.on('pageerror', (error) => {
        console.log('[page-2 error]', error.message);
    });
    secondPage.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) {
            console.log('[page-2 response]', response.status(), response.url());
        }
    });
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

    await secondContext.close();
});
