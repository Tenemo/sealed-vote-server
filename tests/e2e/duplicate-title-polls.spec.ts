import { expect, test } from '@playwright/test';

test('keeps duplicate-title polls on distinct slug URLs', async ({
    browser,
    page,
}) => {
    const pollTitle = `Duplicate title vote ${Date.now()}`;

    const createPoll = async (): Promise<string> => {
        await page.goto('/');
        await page.getByLabel('Vote name').fill(pollTitle);
        await page.getByLabel('Choice to vote for').fill('Apples');
        await page.getByRole('button', { name: 'Add new choice' }).click();
        await page.getByLabel('Choice to vote for').fill('Bananas');
        await page.getByRole('button', { name: 'Add new choice' }).click();
        await page.getByRole('button', { name: 'Create vote' }).click();
        await expect(page).toHaveURL(/\/votes\/[a-z0-9-]+--[0-9a-f]{8,32}$/);

        return page.url();
    };

    const firstPollUrl = await createPoll();
    const secondPollUrl = await createPoll();

    expect(secondPollUrl).not.toBe(firstPollUrl);

    await page.goto(firstPollUrl);
    await page.getByLabel('Voter name*').fill('Alice');
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();
    await expect(page.getByText('Voters in this poll: Alice')).toBeVisible();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();

    await secondPage.goto(secondPollUrl);
    await secondPage.getByLabel('Voter name*').fill('Bob');
    await secondPage.getByRole('button', { exact: true, name: 'Vote' }).click();

    await expect(
        secondPage.getByText('Voters in this poll: Bob'),
    ).toBeVisible();
    await expect(page.getByText('Voters in this poll: Alice')).toBeVisible();
    await expect(page.getByText('Voters in this poll: Bob')).toHaveCount(0);
    await expect(secondPage.getByText('Voters in this poll: Alice')).toHaveCount(
        0,
    );

    await secondContext.close();
});
