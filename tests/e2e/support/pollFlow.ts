import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { gotoInteractablePage, reloadInteractablePage } from './navigation.mts';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';

const escapeRegExp = (value: string): string =>
    value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

const participantRowText = (participantName: string): RegExp =>
    new RegExp(`^\\s*\\d+\\.\\s+${escapeRegExp(participantName)}\\s*$`);

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
    await gotoInteractablePage(page, '/');
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

export const registerParticipant = async ({
    page,
    pollUrl,
    voterName,
}: {
    page: Page;
    pollUrl?: string;
    voterName: string;
}): Promise<void> => {
    if (pollUrl) {
        await gotoInteractablePage(page, pollUrl);
    }

    await page.getByLabel('Your public name').fill(voterName);
    await page.getByRole('button', { exact: true, name: 'Register' }).click();
    await expect(
        page.getByText(new RegExp(`^Registered as ${voterName}\\b`)),
    ).toBeVisible({
        timeout: 30_000,
    });
};

export const closeRegistrations = async (page: Page): Promise<void> => {
    const closeButton = page.getByRole('button', {
        name: 'Close registrations',
    });

    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();
    await closeButton.click();
    await expect(
        page.getByText('Registrations closed. The board ceremony can begin.'),
    ).toBeVisible({ timeout: 30_000 });
};

export const expectParticipantsVisible = async (
    page: Page,
    participantNames: readonly string[],
): Promise<void> => {
    await expect(
        page.getByRole('heading', { name: 'Participants' }),
    ).toBeVisible();

    for (const participantName of participantNames) {
        await expect(
            page
                .getByRole('listitem')
                .filter({ hasText: participantRowText(participantName) })
                .first(),
        ).toBeVisible();
    }
};

export const expectParticipantsHidden = async (
    page: Page,
    participantNames: readonly string[],
): Promise<void> => {
    for (const participantName of participantNames) {
        await expect(
            page
                .getByRole('listitem')
                .filter({ hasText: participantRowText(participantName) }),
        ).toHaveCount(0);
    }
};

export const expectBoardCeremonyVisible = async (
    page: Page,
): Promise<void> => {
    await expect(
        page.getByText(/Phase:\s*setup\./i),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
        page.getByText('Registrations are closed and the board log is authoritative.'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
        page.getByRole('heading', { name: 'Verification' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Board log' }),
    ).toBeVisible();
};

export const reloadPollPage = async (page: Page): Promise<void> => {
    await reloadInteractablePage(page);
};

const deletePoll = async (
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
