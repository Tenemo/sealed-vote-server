import {
    expect,
    type APIRequestContext,
    type Locator,
    type Page,
} from '@playwright/test';

import { gotoInteractablePage, reloadInteractablePage } from './navigation.mts';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';
const postClosePhaseLabels = [
    'Securing the election',
    'Starting reveal',
    'Revealing results',
    'Verified results',
] as const;

const escapeRegExp = (value: string): string =>
    value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CreatePollResponse = {
    creatorToken: string;
    id: string;
    slug: string;
};

export type ExpectedVerifiedResult = {
    acceptedBallotCount: number;
    choice: string;
    displayedMean: string;
    tally: string;
};

export type CreatedPoll = {
    apiBaseUrl: string;
    creatorToken: string;
    pollId: string;
    pollSlug: string;
    pollUrl: string;
};

export type CreatedPollResult = {
    createdPoll: CreatedPoll;
    page: Page;
};

type PageAttacher = (page: Page) => Page;

type CreatePollOptions = {
    attachPage?: PageAttacher;
    choices?: string[];
    page: Page;
    pollName: string;
    skipInitialNavigation?: boolean;
};

type SubmitVoteOptions = {
    attachPage?: PageAttacher;
    choices?: string[];
    page: Page;
    pollUrl?: string;
    scores?: number[];
    voterName: string;
};

const getResultCard = (page: Page, choice: string): Locator =>
    page
        .getByTestId('verified-results-panel')
        .getByTestId('verified-result-card')
        .filter({
            has: page.getByText(choice, { exact: true }),
        })
        .first();

const attachPollFlowPage = (
    page: Page,
    attachPage?: PageAttacher,
): Page => (attachPage ? attachPage(page) : page);

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
                    if (
                        await page
                            .getByText(text, { exact: true })
                            .first()
                            .isVisible()
                    ) {
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
    attachPage,
    page,
    pollName,
    choices = ['Apples', 'Bananas'],
    skipInitialNavigation = false,
}: CreatePollOptions): Promise<CreatedPollResult> => {
    if (!skipInitialNavigation) {
        page = attachPollFlowPage(
            await gotoInteractablePage(page, '/'),
            attachPage,
        );
    }

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
        createdPoll: {
            apiBaseUrl: new URL(createPollResponse.url()).origin,
            creatorToken: createdPoll.creatorToken,
            pollId: createdPoll.id,
            pollSlug: createdPoll.slug,
            pollUrl: page.url(),
        },
        page,
    };
};

export const submitVote = async ({
    attachPage,
    page,
    pollUrl,
    scores = [8, 6],
    voterName,
    choices = ['Apples', 'Bananas'],
}: SubmitVoteOptions): Promise<Page> => {
    if (pollUrl) {
        page = attachPollFlowPage(
            await gotoInteractablePage(page, pollUrl),
            attachPage,
        );
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

    return page;
};

export const createExpectedVerifiedResults = ({
    choices,
    scorecards,
}: {
    choices: readonly string[];
    scorecards: readonly (readonly number[])[];
}): ExpectedVerifiedResult[] => {
    if (scorecards.length === 0) {
        throw new Error('Expected at least one scorecard.');
    }

    return choices.map((choice, choiceIndex) => {
        const tally = scorecards.reduce((sum, scorecard) => {
            const score = scorecard[choiceIndex];

            if (!Number.isInteger(score)) {
                throw new Error(
                    `Missing or invalid score for choice index ${choiceIndex}.`,
                );
            }

            return sum + score;
        }, 0);

        return {
            acceptedBallotCount: scorecards.length,
            choice,
            displayedMean: (tally / scorecards.length).toFixed(2),
            tally: String(tally),
        };
    });
};

export const registerParticipant = async (
    input: Pick<SubmitVoteOptions, 'attachPage' | 'page' | 'pollUrl' | 'voterName'>,
): Promise<Page> => {
    return await submitVote({
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
        texts: postClosePhaseLabels,
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
    expectedResults,
    page,
    choices = ['Apples', 'Bananas'],
}: {
    expectedResults?: readonly ExpectedVerifiedResult[];
    page: Page;
    choices?: string[];
}): Promise<void> => {
    await expect
        .poll(
            async () =>
                await page
                    .getByText('Verified results', { exact: true })
                    .first()
                    .isVisible(),
            {
                timeout: 90_000,
            },
        )
        .toBe(true);
    await expect(
        page.getByText('Verified from the public board log.', {
            exact: true,
        }),
    ).toBeVisible({ timeout: 90_000 });

    if (expectedResults && expectedResults.length === 0) {
        throw new Error('expectedResults must include at least one result.');
    }

    const resultsPanel = page.getByTestId('verified-results-panel');

    const resultsToAssert =
        expectedResults ??
        choices.map((choice) => ({
            acceptedBallotCount: 0,
            choice,
            displayedMean: '',
            tally: '',
        }));

    await expect(resultsPanel.getByTestId('verified-result-card')).toHaveCount(
        resultsToAssert.length,
        {
            timeout: 90_000,
        },
    );

    for (const result of resultsToAssert) {
        const resultCard = getResultCard(page, result.choice);

        await expect(resultCard).toContainText(result.choice, {
            timeout: 90_000,
        });

        if (expectedResults) {
            await expect(resultCard).toContainText(
                `${result.acceptedBallotCount} accepted ballots`,
                {
                    timeout: 90_000,
                },
            );
            await expect(resultCard).toContainText(result.displayedMean, {
                timeout: 90_000,
            });
            await expect(resultCard).toContainText(`Tally ${result.tally}`, {
                timeout: 90_000,
            });
        }
    }
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

export const expectPostCloseVisible = async (page: Page): Promise<void> => {
    await waitForAnyVisibleText({
        page,
        texts: postClosePhaseLabels,
        timeout: 30_000,
    });
    await expect(
        page.getByRole('heading', { name: 'Your next step' }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Audit and verification' }),
    ).toBeVisible();
};

export const reloadPollPage = async (page: Page): Promise<Page> =>
    await reloadInteractablePage(page);

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
