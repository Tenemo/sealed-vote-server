import { expect, type Page } from '@playwright/test';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{8,32}$/;

export const createPoll = async ({
    page,
    pollName,
    choices = ['Apples', 'Bananas'],
}: {
    page: Page;
    pollName: string;
    choices?: string[];
}): Promise<string> => {
    await page.goto('/');
    await page.getByLabel('Vote name').fill(pollName);

    for (const choice of choices) {
        await page.getByLabel('Choice to vote for').fill(choice);
        await page.getByRole('button', { name: 'Add new choice' }).click();
    }

    await page.getByRole('button', { name: 'Create vote' }).click();
    await expect(page).toHaveURL(pollSlugPattern);

    return page.url();
};

export const joinPoll = async ({
    page,
    pollUrl,
    voterName,
}: {
    page: Page;
    pollUrl?: string;
    voterName: string;
}): Promise<void> => {
    if (pollUrl) {
        await page.goto(pollUrl);
    }

    await page.getByLabel('Voter name*').fill(voterName);
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();
    await expect(
        page.getByText('Waiting for the vote to be started...'),
    ).toBeVisible();
};

export const beginVote = async (page: Page): Promise<void> => {
    const beginVoteButton = page.getByRole('button', { name: 'Begin vote' });
    await expect(beginVoteButton).toBeEnabled({ timeout: 30_000 });
    await beginVoteButton.click();
};

export const expectResultsVisible = async (page: Page): Promise<void> => {
    await expect(
        page.getByRole('heading', { name: 'Results' }),
    ).toBeVisible({ timeout: 120_000 });
};

export const getShareLinkValue = async (page: Page): Promise<string> =>
    await page.locator('input[readonly]').inputValue();

export const copyShareLink = async (page: Page): Promise<string> => {
    const origin = new URL(page.url()).origin;

    await page.context().grantPermissions(
        ['clipboard-read', 'clipboard-write'],
        {
            origin,
        },
    );
    await page.getByRole('button', { name: 'Copy vote link' }).click();

    return await page.evaluate(async () => await navigator.clipboard.readText());
};
