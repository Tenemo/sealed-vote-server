import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const connectionToastMessage =
    'Connection to the server was lost. Showing the latest available vote state and retrying in the background.';
export const reconnectingWorkflowMessage =
    'Connection lost. Reconnecting and resuming in the background...';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';

type CreatePollResponse = {
    creatorToken: string;
    id: string;
    slug: string;
};

export type CreatedPoll = {
    apiBaseUrl: string;
    creatorToken: string;
    pollId: string;
    pollSlug: string;
    pollUrl: string;
};

export const createPoll = async ({
    page,
    pollName,
    choices = ['Apples', 'Bananas'],
}: {
    page: Page;
    pollName: string;
    choices?: string[];
}): Promise<CreatedPoll> => {
    await page.goto('/');
    await page.getByLabel('Vote name').fill(pollName);

    for (const choice of choices) {
        await page.getByLabel('Choice to vote for').fill(choice);
        await page.getByRole('button', { name: 'Add new choice' }).click();
    }

    const createPollResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(createPollApiPath),
    );

    await page.getByRole('button', { name: 'Create vote' }).click();
    const createPollResponse = await createPollResponsePromise;
    expect(createPollResponse.ok()).toBeTruthy();

    await expect(page).toHaveURL(pollSlugPattern);
    const createdPoll = (await createPollResponse.json()) as CreatePollResponse;

    return {
        apiBaseUrl: new URL(createPollResponse.url()).origin,
        creatorToken: createdPoll.creatorToken,
        pollId: createdPoll.id,
        pollSlug: createdPoll.slug,
        pollUrl: page.url(),
    };
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

    await page.getByLabel('Voter name').fill(voterName);
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

export const expectConnectionToastVisible = async (
    page: Page,
): Promise<void> => {
    await expect(page.locator('[data-slot="connection-toast"]')).toBeVisible({
        timeout: 20_000,
    });
    await expect(page.getByText(connectionToastMessage)).toBeVisible();
};

export const expectConnectionToastHidden = async (
    page: Page,
): Promise<void> => {
    await expect(page.locator('[data-slot="connection-toast"]')).toBeHidden({
        timeout: 20_000,
    });
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

export const deletePoll = async (
    request: APIRequestContext,
    poll: CreatedPoll,
): Promise<void> => {
    const deleteResponse = await request.delete(
        `${poll.apiBaseUrl}/api/polls/${poll.pollId}`,
        {
            data: {
                creatorToken: poll.creatorToken,
            },
        },
    );

    expect(deleteResponse.ok()).toBeTruthy();
};

export const deletePolls = async (
    request: APIRequestContext,
    polls: readonly CreatedPoll[],
): Promise<void> => {
    const pollsToDelete = [...polls].reverse();

    for (const poll of pollsToDelete) {
        await deletePoll(request, poll);
    }
};
