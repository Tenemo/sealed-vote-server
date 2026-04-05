import { expect, test } from '@playwright/test';

test('blocks duplicate voter names before registration submission', async ({
    browser,
    page,
}) => {
    await page.goto('/');

    await page.getByLabel('Vote name').fill(`Duplicate name vote ${Date.now()}`);
    await page.getByLabel('Choice to vote for').fill('Apples');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByLabel('Choice to vote for').fill('Bananas');
    await page.getByRole('button', { name: 'Add new choice' }).click();
    await page.getByRole('button', { name: 'Create vote' }).click();

    await expect(page).toHaveURL(/\/votes\/.+/);

    await page.getByLabel('Voter name*').fill('Alice');
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto(page.url());

    const secondVoteButton = secondPage.getByRole('button', {
        exact: true,
        name: 'Vote',
    });

    await secondPage.getByLabel('Voter name*').fill('Alice');

    await expect(
        secondPage.getByText('This voter name already exists'),
    ).toBeVisible();
    await expect(secondVoteButton).toBeDisabled();

    await secondPage.getByLabel('Voter name*').fill('Bob');

    await expect(
        secondPage.getByText('This voter name already exists'),
    ).toBeHidden();
    await expect(secondVoteButton).toBeEnabled();

    await secondContext.close();
});
