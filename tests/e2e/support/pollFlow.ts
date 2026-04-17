import {
    expect,
    type APIRequestContext,
    type Locator,
    type Page,
} from '@playwright/test';

import { gotoInteractablePage, reloadInteractablePage } from './navigation.mts';
import { isLocalLoopbackHostname } from './localOrigin.mts';

const pollSlugPattern = /\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';
const postClosePhaseLabels = [
    'Securing the election',
    'Starting reveal',
    'Revealing results',
    'Verified results',
] as const;
const voteStoredNoticeText =
    'Vote stored on this device. You can close the app and come back after voting closes.';

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

const getCeremonyMetricRow = (page: Page, label: string): Locator =>
    page
        .getByRole('heading', { name: 'Ceremony progress' })
        .locator('xpath=../following-sibling::*[1]')
        .getByText(label, { exact: true })
        .locator('xpath=..');

const normalizePollFlowText = (value: string): string =>
    value.replaceAll(/\s+/gu, ' ').trim();

const shouldHardResyncPollPage = (page: Page): boolean => {
    let currentPageUrl = '';

    try {
        currentPageUrl = page.url();
    } catch {
        return true;
    }

    if (!currentPageUrl || currentPageUrl === 'about:blank') {
        return true;
    }

    let parsedPageUrl: URL;

    try {
        parsedPageUrl = new URL(currentPageUrl);
    } catch {
        return true;
    }

    if (parsedPageUrl.protocol !== 'http:' && parsedPageUrl.protocol !== 'https:') {
        return true;
    }

    return !isLocalLoopbackHostname(parsedPageUrl.hostname);
};

export const parseCeremonyMetricValue = ({
    label,
    rowText,
}: {
    label: string;
    rowText: string;
}): string | null => {
    const normalizedLabel = normalizePollFlowText(label);
    const normalizedRowText = normalizePollFlowText(rowText);

    if (normalizedRowText.startsWith(normalizedLabel)) {
        const metricValue = normalizedRowText.slice(normalizedLabel.length).trim();
        return metricValue === '' ? null : metricValue;
    }

    if (normalizedRowText.endsWith(normalizedLabel)) {
        const metricValue = normalizedRowText
            .slice(0, -normalizedLabel.length)
            .trim();
        return metricValue === '' ? null : metricValue;
    }

    return null;
};

export const parseSubmittedParticipantCount = (value: string): number | null => {
    const match = normalizePollFlowText(value).match(
        /^Submitted participants\s+(\d+)/u,
    );

    if (!match) {
        return null;
    }

    return Number.parseInt(match[1], 10);
};

const readSubmittedParticipantCount = async (
    page: Page,
): Promise<number | null> => {
    const metricText = await getCeremonyMetricRow(
        page,
        'Submitted participants',
    ).innerText();

    return parseSubmittedParticipantCount(metricText);
};

export const syncPollPageForSharedState = async (
    page: Page,
    reloadPage: (page: Page) => Promise<Page> = reloadInteractablePage,
): Promise<Page> => {
    // Only live remote runs need a hard reload here. On local CI origins that
    // reload aborts in-flight poll fetches on mobile Firefox and can surface
    // spurious React console errors even though the local app itself is fine.
    await page.bringToFront();

    if (!shouldHardResyncPollPage(page)) {
        return page;
    }

    return await reloadPage(page);
};

export const syncPollPagesForSharedState = async ({
    attachPages = [],
    pages,
    reloadPage = reloadInteractablePage,
}: {
    attachPages?: Array<PageAttacher | undefined>;
    pages: readonly Page[];
    reloadPage?: (page: Page) => Promise<Page>;
}): Promise<Page[]> => {
    const syncedPages: Page[] = [];

    for (const [index, page] of pages.entries()) {
        // Production ceremony flows keep several participant pages alive in
        // the background. If one background page loses its poll loop after a
        // transient network failure, foregrounding and reloading it here keeps
        // shared ceremony assertions deterministic on CI runners.
        const syncedPage = await syncPollPageForSharedState(page, reloadPage);
        syncedPages.push(attachPollFlowPage(syncedPage, attachPages[index]));
    }

    return syncedPages;
};

export const bringPollPagesToFront = async ({
    attachPages = [],
    pages,
}: {
    attachPages?: Array<PageAttacher | undefined>;
    pages: readonly Page[];
}): Promise<Page[]> => {
    const focusedPages: Page[] = [];

    for (const [index, page] of pages.entries()) {
        await page.bringToFront();
        focusedPages.push(attachPollFlowPage(page, attachPages[index]));
    }

    return focusedPages;
};

const waitForCeremonyMetricValue = async ({
    label,
    page,
    timeout = 60_000,
    value,
}: {
    label: string;
    page: Page;
    timeout?: number;
    value: string;
}): Promise<void> => {
    const metricRow = getCeremonyMetricRow(page, label);

    await expect(metricRow).toBeVisible({
        timeout,
    });
    await expect
        .poll(
            async () =>
                parseCeremonyMetricValue({
                    label,
                    rowText: await metricRow.innerText(),
                }),
            {
                timeout,
            },
        )
        .toBe(value);
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

    const submittedParticipantCountBeforeSubmit =
        await readSubmittedParticipantCount(page);

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
    await expect(page.getByText(voteStoredNoticeText, { exact: true })).toBeVisible({
        timeout: 30_000,
    });

    if (submittedParticipantCountBeforeSubmit !== null) {
        await waitForCeremonyMetricValue({
            label: 'Submitted participants',
            page,
            value: String(submittedParticipantCountBeforeSubmit + 1),
        });
    }

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

export const closeVoting = async (page: Page): Promise<Page> => {
    page = await syncPollPageForSharedState(page);
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
    return page;
};

export const waitForAutomaticReveal = async (page: Page): Promise<Page> => {
    await page.bringToFront();
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
    return page;
};

export const waitForVerifiedResults = async ({
    expectedResults,
    page,
    choices = ['Apples', 'Bananas'],
}: {
    expectedResults?: readonly ExpectedVerifiedResult[];
    page: Page;
    choices?: string[];
}): Promise<Page> => {
    await page.bringToFront();
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

    return page;
};

export const waitForCeremonyMetric = async ({
    label,
    page,
    value,
}: {
    label: string;
    page: Page;
    value: string;
}): Promise<Page> => {
    page = await syncPollPageForSharedState(page);
    await waitForCeremonyMetricValue({
        label,
        page,
        value,
    });
    return page;
};

export const waitForBlockingParticipants = async ({
    page,
    participantNames,
}: {
    page: Page;
    participantNames: readonly string[];
}): Promise<Page> => {
    page = await syncPollPageForSharedState(page);
    await expect(
        page.getByText(
            `Ceremony progress is waiting on ${participantNames.join(', ')}.`,
        ),
    ).toBeVisible({ timeout: 60_000 });
    return page;
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
    await syncPollPageForSharedState(page);

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
