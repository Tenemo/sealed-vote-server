import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { gotoInteractablePage, reloadInteractablePage } from './navigation.mts';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';

const escapeRegExp = (value: string): string =>
    value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const waitForAnyVisibleText = async ({
    page,
    texts,
    timeout,
}: {
    page: Page;
    texts: readonly string[];
    timeout: number;
}): Promise<void> => {
    await expect
        .poll(
            async () => {
                for (const text of texts) {
                    if (await page.getByText(text, { exact: true }).first().isVisible()) {
                        return text;
                    }
                }

                return null;
            },
            {
                timeout,
            },
        )
        .not.toBeNull();
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

export const submitVote = async ({
    page,
    pollUrl,
    scores = [8, 6],
    voterName,
    choices = ['Apples', 'Bananas'],
}: {
    page: Page;
    pollUrl?: string;
    scores?: number[];
    voterName: string;
    choices?: string[];
}): Promise<void> => {
    if (pollUrl) {
        await gotoInteractablePage(page, pollUrl);
    }

    await page.getByLabel('Your public name').fill(voterName);

    for (const [index, choice] of choices.entries()) {
        const score = scores[index];
        await page
            .getByRole('button', {
                name: `Score ${choice} as ${score}`,
            })
            .click();
    }

    await page.getByRole('button', { name: 'Submit vote' }).click();
    await expect(
        page.getByText('Vote stored on this device', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
};

export const registerParticipant = async (input: {
    page: Page;
    pollUrl?: string;
    voterName: string;
}): Promise<void> => {
    await submitVote({
        ...input,
    });
};

export const closeVoting = async (page: Page): Promise<void> => {
    const closeButton = page.getByRole('button', {
        name: 'Close voting',
    });

    await expect(closeButton).toBeVisible({ timeout: 30_000 });
    await expect(closeButton).toBeEnabled({ timeout: 30_000 });
    await closeButton.click();
    await waitForAnyVisibleText({
        page,
        texts: [
            'Securing the election',
            'Starting reveal',
            'Revealing results',
            'Verified results',
        ],
        timeout: 30_000,
    });
};

export const waitForAutomaticReveal = async (page: Page): Promise<void> => {
    await waitForAnyVisibleText({
        page,
        texts: [
            'Closing the counted ballot set so the results can be opened.',
            'Revealing results',
            'Verified results',
        ],
        timeout: 90_000,
    });
    await expect(
        page.getByRole('button', { name: 'Reveal results' }),
    ).toHaveCount(0);
};

export const waitForVerifiedResults = async ({
    page,
    choices = ['Apples', 'Bananas'],
}: {
    page: Page;
    choices?: string[];
}): Promise<void> => {
    await expect(
        page.getByText('Verified results', { exact: true }),
    ).toBeVisible({
        timeout: 90_000,
    });
    await expect(
        page.getByText('Verified from the public board log.', {
            exact: true,
        }),
    ).toBeVisible({ timeout: 90_000 });

    for (const choice of choices) {
        await expect(page.getByText(choice, { exact: true })).toBeVisible({
            timeout: 90_000,
        });
    }
};

export const expectAcceptedBallotCount = async ({
    choices = ['Apples', 'Bananas'],
    count,
    page,
}: {
    choices?: string[];
    count: number;
    page: Page;
}): Promise<void> => {
    const expectedText = `${count} accepted ballots`;

    await expect(page.getByText(expectedText, { exact: true })).toHaveCount(
        choices.length,
    );
};

export const waitForCeremonyMetric = async ({
    label,
    page,
    value,
}: {
    label: string;
    page: Page;
    value: string;
}): Promise<void> => {
    await expect(
        page.getByText(label, { exact: true }).locator('xpath=..'),
    ).toContainText(value, { timeout: 60_000 });
};

export const waitForBlockingParticipants = async ({
    page,
    participantNames,
}: {
    page: Page;
    participantNames: readonly string[];
}): Promise<void> => {
    await expect(
        page.getByText(
            `Ceremony progress is waiting on ${participantNames.join(', ')}.`,
        ),
    ).toBeVisible({ timeout: 60_000 });
};

export const expectParticipantsVisible = async (
    page: Page,
    participantNames: readonly string[],
): Promise<void> => {
    await expect(
        page.getByRole('heading', { name: 'Participants' }),
    ).toBeVisible();
    const participantsList = page.getByRole('list', {
        name: 'Participants roster',
    });

    for (const participantName of participantNames) {
        await expect(
            participantsList.getByText(
                new RegExp(`^\\d+\\.\\s+${escapeRegExp(participantName)}$`),
            ),
        ).toBeVisible();
    }
};

export const expectParticipantsHidden = async (
    page: Page,
    participantNames: readonly string[],
): Promise<void> => {
    const participantsList = page.getByRole('list', {
        name: 'Participants roster',
    });

    for (const participantName of participantNames) {
        await expect(
            participantsList.getByText(
                new RegExp(`^\\d+\\.\\s+${escapeRegExp(participantName)}$`),
            ),
        ).toHaveCount(0);
    }
};

export const expectSecuringVisible = async (page: Page): Promise<void> => {
    await expect(page.getByText('Securing the election')).toBeVisible({
        timeout: 30_000,
    });
    await expect(
        page.getByRole('heading', { name: 'Your next step' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Audit and verification' }),
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
