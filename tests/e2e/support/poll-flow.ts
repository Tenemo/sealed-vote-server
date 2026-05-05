import {
    expect,
    type APIRequestContext,
    type Locator,
    type Page,
    type Request,
    type Response,
} from '@playwright/test';

import {
    gotoInteractablePage,
    isLocalLoopbackHostname,
    reloadInteractablePage,
} from './navigation.mts';
import {
    parseCeremonyMetricValue,
    parseSubmittedVoterCount,
    type ExpectedVerifiedResult,
} from './poll-flow-formatters.ts';

export {
    createExpectedVerifiedResults,
    parseCeremonyMetricValue,
    parseSubmittedVoterCount,
    type ExpectedVerifiedResult,
} from './poll-flow-formatters.ts';

const pollSlugPattern = /\/polls\/[a-z0-9-]+--[0-9a-f]{4}$/;
const createPollApiPath = '/api/polls/create';
const createPollResponseTimeoutMs = 60_000;
const createPollRetryReadinessTimeoutMs = 30_000;
const creatorSessionsStorageKey = 'sealed-vote.creator-sessions.v2';
const postClosePhaseLabels = [
    'Securing the election',
    'Starting reveal',
    'Revealing results',
    'Verified results',
] as const;
const voteStoredNoticeText =
    'Vote stored on this device. You can close the app and come back after voting closes.';
const sharedStateSoftSyncTimeoutMs = 30_000;

const escapeRegExp = (value: string): string =>
    value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CreatePollResponse = {
    creatorToken: string;
    id: string;
    slug: string;
};

type CreatePollAttemptOutcome =
    | {
          response: Response;
          type: 'response';
      }
    | {
          error: unknown;
          type: 'response-timeout';
      }
    | {
          request: Request;
          type: 'request-failed';
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

const isCreatePollRequest = (request: Request): boolean =>
    request.method() === 'POST' && request.url().endsWith(createPollApiPath);

const isCreatePollResponse = (response: Response): boolean =>
    isCreatePollRequest(response.request());

export const resolveRecoveredPollApiBaseUrl = (
    pageUrl: string,
    configuredApiBaseUrl: string | undefined = process.env.VITE_API_BASE_URL,
): string => {
    const normalizedConfiguredApiBaseUrl = configuredApiBaseUrl?.trim();

    if (normalizedConfiguredApiBaseUrl) {
        return new URL(normalizedConfiguredApiBaseUrl).origin;
    }

    const parsedPageUrl = new URL(pageUrl);

    if (isLocalLoopbackHostname(parsedPageUrl.hostname)) {
        return parsedPageUrl.origin;
    }

    return `${parsedPageUrl.protocol}//api.${parsedPageUrl.host}`;
};

const recoverCreatedPollFromClientState = async (
    page: Page,
): Promise<CreatedPoll | null> => {
    const currentPageUrl = page.url();
    const parsedPageUrl = new URL(currentPageUrl);

    if (!pollSlugPattern.test(parsedPageUrl.pathname)) {
        return null;
    }

    const storedCreatorSession = await page.evaluate(
        ({
            currentPollSlug,
            storageKey,
        }: {
            currentPollSlug: string;
            storageKey: string;
        }) => {
            try {
                const rawCreatorSessions =
                    window.localStorage.getItem(storageKey);

                if (!rawCreatorSessions) {
                    return null;
                }

                const parsedCreatorSessions = JSON.parse(rawCreatorSessions);

                if (
                    typeof parsedCreatorSessions !== 'object' ||
                    parsedCreatorSessions === null ||
                    Array.isArray(parsedCreatorSessions)
                ) {
                    return null;
                }

                const matchingCreatorSession = Object.values(
                    parsedCreatorSessions,
                ).find((candidate) => {
                    if (typeof candidate !== 'object' || candidate === null) {
                        return false;
                    }

                    const possibleCreatorSession = candidate as Partial<{
                        creatorToken: string;
                        pollId: string;
                        pollSlug: string;
                    }>;

                    return (
                        possibleCreatorSession.pollSlug === currentPollSlug &&
                        typeof possibleCreatorSession.creatorToken ===
                            'string' &&
                        typeof possibleCreatorSession.pollId === 'string'
                    );
                });

                if (!matchingCreatorSession) {
                    return null;
                }

                return matchingCreatorSession as {
                    creatorToken: string;
                    pollId: string;
                    pollSlug: string;
                };
            } catch {
                return null;
            }
        },
        {
            currentPollSlug: parsedPageUrl.pathname.split('/').at(-1) ?? '',
            storageKey: creatorSessionsStorageKey,
        },
    );

    if (!storedCreatorSession) {
        return null;
    }

    return {
        apiBaseUrl: resolveRecoveredPollApiBaseUrl(currentPageUrl),
        creatorToken: storedCreatorSession.creatorToken,
        pollId: storedCreatorSession.pollId,
        pollSlug: storedCreatorSession.pollSlug,
        pollUrl: currentPageUrl,
    };
};

const waitForCreatePollAttemptOutcome = async (
    page: Page,
): Promise<CreatePollAttemptOutcome> => {
    return await new Promise<CreatePollAttemptOutcome>(
        (resolve, reject) => {
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
            let isSettled = false;

            const cleanup = (): void => {
                page.off('response', onResponse);
                page.off('requestfailed', onRequestFailed);

                if (timeoutHandle !== null) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
            };

            const settle = (outcome: CreatePollAttemptOutcome): void => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                cleanup();
                resolve(outcome);
            };

            const rejectAttempt = (error: unknown): void => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                cleanup();
                reject(error);
            };

            const onResponse = (response: Response): void => {
                if (!isCreatePollResponse(response)) {
                    return;
                }

                settle({
                    response,
                    type: 'response',
                });
            };

            const onRequestFailed = (request: Request): void => {
                if (!isCreatePollRequest(request)) {
                    return;
                }

                settle({
                    request,
                    type: 'request-failed',
                });
            };

            page.on('response', onResponse);
            page.on('requestfailed', onRequestFailed);
            timeoutHandle = setTimeout(() => {
                settle({
                    error: new Error(
                        `Timed out after ${createPollResponseTimeoutMs}ms waiting for ${createPollApiPath}.`,
                    ),
                    type: 'response-timeout',
                });
            }, createPollResponseTimeoutMs);

            void page
                .getByRole('button', { name: 'Create poll' })
                .click()
                .catch(rejectAttempt);
        },
    );
};

const waitForRetryableCreatePollState = async (
    page: Page,
): Promise<boolean> => {
    try {
        await expect(
            page.getByRole('button', { name: 'Create poll' }),
        ).toBeEnabled({
            timeout: createPollRetryReadinessTimeoutMs,
        });
        return await page.getByLabel('Poll name').isVisible();
    } catch {
        return false;
    }
};

const formatCreatePollAttemptFailure = (
    createPollAttemptOutcome: Exclude<
        CreatePollAttemptOutcome,
        { type: 'response'; response: Response }
    >,
): string => {
    if (createPollAttemptOutcome.type === 'request-failed') {
        return (
            createPollAttemptOutcome.request.failure()?.errorText ??
            'unknown request failure'
        );
    }

    return createPollAttemptOutcome.error instanceof Error
        ? createPollAttemptOutcome.error.message
        : 'unknown create poll timeout';
};

const getCeremonyMetricRow = (page: Page, label: string): Locator =>
    page
        .getByRole('heading', { name: 'Ceremony progress' })
        .locator('xpath=../following-sibling::*[1]')
        .getByText(label, { exact: true })
        .locator('xpath=..');

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

const readSubmittedVoterCount = async (
    page: Page,
): Promise<number | null> => {
    const metricText = await getCeremonyMetricRow(page, 'Submitted voters')
        .innerText();

    return parseSubmittedVoterCount(metricText);
};

type PollPageReloader = (page: Page) => Promise<Page>;

export const syncPollPageForSharedState = async (
    page: Page,
    reloadPage: PollPageReloader = reloadInteractablePage,
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

export const waitForPollPageState = async ({
    page,
    reloadPage = reloadInteractablePage,
    timeout,
    waitForState,
}: {
    page: Page;
    reloadPage?: PollPageReloader;
    timeout: number;
    waitForState: (page: Page, timeout: number) => Promise<void>;
}): Promise<Page> => {
    await page.bringToFront();
    const shouldHardReload = shouldHardResyncPollPage(page);

    try {
        await waitForState(
            page,
            shouldHardReload
                ? Math.min(timeout, sharedStateSoftSyncTimeoutMs)
                : timeout,
        );
        return page;
    } catch (error) {
        if (!shouldHardReload) {
            throw error;
        }
    }

    page = await reloadPage(page);
    await page.bringToFront();
    await waitForState(page, timeout);
    return page;
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

    await page.getByLabel('Poll name').fill(pollName);

    for (const choice of choices) {
        await page.getByLabel('Choice name').fill(choice);
        await page.getByRole('button', { name: 'Add new choice' }).click();
    }

    let createPollAttemptOutcome = await waitForCreatePollAttemptOutcome(page);

    if (createPollAttemptOutcome.type !== 'response') {
        const recoveredCreatedPoll =
            await recoverCreatedPollFromClientState(page);

        if (recoveredCreatedPoll) {
            return {
                createdPoll: recoveredCreatedPoll,
                page,
            };
        }

        // Poll creation is idempotent per creator token. If the first transport
        // fails after the server commits, the page remains on the form and a
        // second click safely replays the same request.
        const canRetryCreatePoll =
            await waitForRetryableCreatePollState(page);

        if (!canRetryCreatePoll) {
            throw new Error(
                `Create poll did not produce a response and could not be retried: ${formatCreatePollAttemptFailure(createPollAttemptOutcome)}`,
            );
        }

        createPollAttemptOutcome = await waitForCreatePollAttemptOutcome(page);

        if (createPollAttemptOutcome.type !== 'response') {
            const recoveredCreatedPollAfterRetry =
                await recoverCreatedPollFromClientState(page);

            if (recoveredCreatedPollAfterRetry) {
                return {
                    createdPoll: recoveredCreatedPollAfterRetry,
                    page,
                };
            }

            throw new Error(
                `Retrying create poll did not produce a response: ${formatCreatePollAttemptFailure(createPollAttemptOutcome)}`,
            );
        }
    }

    const createPollResponse = createPollAttemptOutcome.response;
    const createPollResponseText = await createPollResponse.text();

    if (!createPollResponse.ok()) {
        throw new Error(
            `Create poll failed with ${createPollResponse.status()} ${createPollResponse.statusText()}: ${createPollResponseText}`,
        );
    }

    await expect(page).toHaveURL(pollSlugPattern);
    const createdPoll = JSON.parse(
        createPollResponseText,
    ) as CreatePollResponse;

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

    const submittedVoterCountBeforeSubmit =
        await readSubmittedVoterCount(page);

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

    if (submittedVoterCountBeforeSubmit !== null) {
        await waitForCeremonyMetricValue({
            label: 'Submitted voters',
            page,
            value: String(submittedVoterCountBeforeSubmit + 1),
        });
    }

    return page;
};

export const registerParticipant = async (
    input: Pick<SubmitVoteOptions, 'attachPage' | 'page' | 'pollUrl' | 'voterName'>,
): Promise<Page> => {
    return await submitVote({
        ...input,
    });
};

export const closeVoting = async (page: Page): Promise<Page> => {
    page = await waitForPollPageState({
        page,
        timeout: 30_000,
        waitForState: async (candidatePage, timeout) => {
            const closeButton = candidatePage.getByRole('button', {
                name: 'Close voting',
            });

            await expect(closeButton).toBeVisible({ timeout });
            await expect(closeButton).toBeEnabled({ timeout });
        },
    });
    const closeButton = page.getByRole('button', {
        name: 'Close voting',
    });

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

        await expect(resultCard).toHaveCount(1, {
            timeout: 90_000,
        });

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
    return await waitForPollPageState({
        page,
        timeout: 60_000,
        waitForState: async (candidatePage, timeout) => {
            await waitForCeremonyMetricValue({
                label,
                page: candidatePage,
                timeout,
                value,
            });
        },
    });
};

export const waitForBlockingVoters = async ({
    page,
    voterNames,
}: {
    page: Page;
    voterNames: readonly string[];
}): Promise<Page> => {
    return await waitForPollPageState({
        page,
        timeout: 60_000,
        waitForState: async (candidatePage, timeout) => {
            await expect(
                candidatePage.getByText(
                    `Ceremony progress is waiting on ${voterNames.join(', ')}.`,
                ),
            ).toBeVisible({ timeout });
        },
    });
};

export const expectVotersVisible = async (
    page: Page,
    voterNames: readonly string[],
): Promise<void> => {
    await expect(page.getByRole('heading', { name: 'Voters' })).toBeVisible();
    const votersList = page.getByRole('list', {
        name: 'Voters roster',
    });

    for (const voterName of voterNames) {
        await expect(
            votersList.getByText(
                new RegExp(`^\\d+\\.\\s+${escapeRegExp(voterName)}$`),
            ),
        ).toBeVisible();
    }
};

export const expectVotersHidden = async (
    page: Page,
    voterNames: readonly string[],
): Promise<void> => {
    const votersList = page.getByRole('list', {
        name: 'Voters roster',
    });

    for (const voterName of voterNames) {
        await expect(
            votersList.getByText(
                new RegExp(`^\\d+\\.\\s+${escapeRegExp(voterName)}$`),
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

    if (!deleteResponse.ok()) {
        throw new Error(
            `Delete poll failed with ${deleteResponse.status()} ${deleteResponse.statusText()}: ${await deleteResponse.text()}`,
        );
    }
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
