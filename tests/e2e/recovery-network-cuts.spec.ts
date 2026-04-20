import { expect, test, type Request, type TestInfo } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    type CreatedPoll,
} from './support/poll-flow';
import { dropNextPostResponseAfterServerCommit } from './support/network';
import { createPollName, createTestNamespace } from './support/test-data';

const localSyntheticDropHosts = new Set(['127.0.0.1', 'localhost']);
const createPollApiPath = '/api/polls/create';

type CreatePollRequest = {
    choices: string[];
    creatorToken: string;
    pollName: string;
    protocolVersion?: 'v1';
};

type CreatePollResponse = {
    creatorToken: string;
    id: string;
    slug: string;
};

type PollResponse = {
    choices: string[];
    id: string;
    pollName: string;
    slug: string;
};

const getPollApiPath = (pollReference: string): string => `/api/polls/${pollReference}`;

const supportsSyntheticPostCommitDrops = (testInfo: TestInfo): boolean => {
    const baseUrl = testInfo.project.use.baseURL;

    if (typeof baseUrl !== 'string') {
        return false;
    }

    try {
        return localSyntheticDropHosts.has(new URL(baseUrl).hostname);
    } catch {
        return false;
    }
};

const skipUnsupportedSyntheticDropScenario = (
    browserName: string,
    testInfo: TestInfo,
): void => {
    test.skip(
        browserName === 'webkit' ||
            testInfo.project.name === 'mobile-firefox-android' ||
            !supportsSyntheticPostCommitDrops(testInfo),
        'This synthetic post-commit transport drop is covered only against the local test backend on desktop Chromium and Firefox.',
    );
};

test('retries poll creation safely after the initial response is lost', async ({
    browserName,
    page,
    request,
}, testInfo) => {
    skipUnsupportedSyntheticDropScenario(browserName, testInfo);

    const createdPolls: CreatedPoll[] = [];
    const capturedCreateRequests: CreatePollRequest[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Create retry', namespace);
    const captureCreateRequest = (browserRequest: Request): void => {
        if (
            browserRequest.method() !== 'POST' ||
            !browserRequest.url().includes(createPollApiPath)
        ) {
            return;
        }

        capturedCreateRequests.push(
            browserRequest.postDataJSON() as CreatePollRequest,
        );
    };

    let droppedCreate:
        | Awaited<ReturnType<typeof dropNextPostResponseAfterServerCommit>>
        | null = null;

    try {
        page = await gotoInteractablePage(page, '/');
        page.on('request', captureCreateRequest);
        await page.getByLabel('Poll name').fill(pollName);

        for (const choice of ['Apples', 'Bananas']) {
            await page.getByLabel('Choice name').fill(choice);
            await page.getByRole('button', { name: 'Add new choice' }).click();
        }

        droppedCreate = await dropNextPostResponseAfterServerCommit({
            page,
            url: /\/api\/polls\/create$/,
        });

        await page.getByRole('button', { name: 'Create poll' }).click();
        await droppedCreate.waitForDrop();

        await expect(page).toHaveURL('/');

        const createPollResponsePromise = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                response.url().endsWith(createPollApiPath) &&
                response.ok(),
        );

        await page.getByRole('button', { name: 'Create poll' }).click();

        const createPollResponse = await createPollResponsePromise;
        const createdPoll = (await createPollResponse.json()) as CreatePollResponse;
        const apiBaseUrl = new URL(createPollResponse.url()).origin;

        createdPolls.push({
            apiBaseUrl,
            creatorToken: createdPoll.creatorToken,
            pollId: createdPoll.id,
            pollSlug: createdPoll.slug,
            pollUrl: page.url(),
        });

        await expect(page).toHaveURL(new RegExp(`/polls/${createdPoll.slug}$`));
        expect(capturedCreateRequests).toHaveLength(2);
        expect(capturedCreateRequests[0]).toEqual(capturedCreateRequests[1]);

        const replayCreateResponse = await request.post(
            `${apiBaseUrl}${createPollApiPath}`,
            {
                data: capturedCreateRequests[0],
            },
        );
        expect(replayCreateResponse.ok()).toBeTruthy();

        const replayedPoll =
            (await replayCreateResponse.json()) as CreatePollResponse;
        expect(replayedPoll.id).toBe(createdPoll.id);
        expect(replayedPoll.slug).toBe(createdPoll.slug);
        expect(replayedPoll.creatorToken).toBe(createdPoll.creatorToken);

        const [fetchByIdResponse, fetchBySlugResponse] = await Promise.all([
            request.get(`${apiBaseUrl}${getPollApiPath(createdPoll.id)}`),
            request.get(`${apiBaseUrl}${getPollApiPath(createdPoll.slug)}`),
        ]);

        expect(fetchByIdResponse.ok()).toBeTruthy();
        expect(fetchBySlugResponse.ok()).toBeTruthy();

        const fetchById = (await fetchByIdResponse.json()) as PollResponse;
        const fetchBySlug = (await fetchBySlugResponse.json()) as PollResponse;

        expect(fetchById.id).toBe(createdPoll.id);
        expect(fetchById.slug).toBe(createdPoll.slug);
        expect(fetchById.pollName).toBe(pollName);
        expect(fetchById.choices).toEqual(['Apples', 'Bananas']);
        expect(fetchBySlug.id).toBe(createdPoll.id);
        expect(fetchBySlug.slug).toBe(createdPoll.slug);
        expect(fetchBySlug.pollName).toBe(pollName);
        expect(fetchBySlug.choices).toEqual(['Apples', 'Bananas']);
    } finally {
        page.off('request', captureCreateRequest);

        if (droppedCreate) {
            await droppedCreate.dispose();
        }

        await deletePolls(request, createdPolls);
    }
});

test('createPoll helper retries idempotently after the initial response is lost', async ({
    browserName,
    page,
    request,
}, testInfo) => {
    skipUnsupportedSyntheticDropScenario(browserName, testInfo);

    const createdPolls: CreatedPoll[] = [];
    const capturedCreateRequests: CreatePollRequest[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Create helper retry', namespace);
    const captureCreateRequest = (browserRequest: Request): void => {
        if (
            browserRequest.method() !== 'POST' ||
            !browserRequest.url().includes(createPollApiPath)
        ) {
            return;
        }

        capturedCreateRequests.push(
            browserRequest.postDataJSON() as CreatePollRequest,
        );
    };

    let droppedCreate:
        | Awaited<ReturnType<typeof dropNextPostResponseAfterServerCommit>>
        | null = null;

    try {
        page = await gotoInteractablePage(page, '/');
        page.on('request', captureCreateRequest);

        droppedCreate = await dropNextPostResponseAfterServerCommit({
            page,
            url: /\/api\/polls\/create$/,
        });

        const createdPollResult = await createPoll({
            choices: ['Apples', 'Bananas'],
            page,
            pollName,
            skipInitialNavigation: true,
        });
        page = createdPollResult.page;
        const createdPoll = createdPollResult.createdPoll;
        createdPolls.push(createdPoll);

        await droppedCreate.waitForDrop();
        await expect(page).toHaveURL(new RegExp(`/polls/${createdPoll.pollSlug}$`));
        expect(capturedCreateRequests).toHaveLength(2);
        expect(capturedCreateRequests[0]).toEqual(capturedCreateRequests[1]);

        const replayCreateResponse = await request.post(
            `${createdPoll.apiBaseUrl}${createPollApiPath}`,
            {
                data: capturedCreateRequests[0],
            },
        );
        expect(replayCreateResponse.ok()).toBeTruthy();

        const replayedPoll =
            (await replayCreateResponse.json()) as CreatePollResponse;
        expect(replayedPoll.id).toBe(createdPoll.pollId);
        expect(replayedPoll.slug).toBe(createdPoll.pollSlug);
        expect(replayedPoll.creatorToken).toBe(createdPoll.creatorToken);

        const [fetchByIdResponse, fetchBySlugResponse] = await Promise.all([
            request.get(
                `${createdPoll.apiBaseUrl}${getPollApiPath(createdPoll.pollId)}`,
            ),
            request.get(
                `${createdPoll.apiBaseUrl}${getPollApiPath(createdPoll.pollSlug)}`,
            ),
        ]);

        expect(fetchByIdResponse.ok()).toBeTruthy();
        expect(fetchBySlugResponse.ok()).toBeTruthy();

        const fetchById = (await fetchByIdResponse.json()) as PollResponse;
        const fetchBySlug = (await fetchBySlugResponse.json()) as PollResponse;

        expect(fetchById.id).toBe(createdPoll.pollId);
        expect(fetchById.slug).toBe(createdPoll.pollSlug);
        expect(fetchById.pollName).toBe(pollName);
        expect(fetchById.choices).toEqual(['Apples', 'Bananas']);
        expect(fetchBySlug.id).toBe(createdPoll.pollId);
        expect(fetchBySlug.slug).toBe(createdPoll.pollSlug);
        expect(fetchBySlug.pollName).toBe(pollName);
        expect(fetchBySlug.choices).toEqual(['Apples', 'Bananas']);
    } finally {
        page.off('request', captureCreateRequest);

        if (droppedCreate) {
            await droppedCreate.dispose();
        }

        await deletePolls(request, createdPolls);
    }
});
