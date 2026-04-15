import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { expect, test, type Locator, type Page, type Video } from '@playwright/test';

import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createExpectedVerifiedResults,
    deletePolls,
    expectParticipantsVisible,
    expectSecuringVisible,
    waitForAutomaticReveal,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/pollFlow';
import {
    closeParticipant,
    openProjectParticipant,
    type ManagedParticipant,
} from './support/participants';
import {
    readmeDemoManifestPath,
    readmeDemoPanelViewport,
    readmeDemoPlaybackRate,
    type ReadmeDemoManifest,
    type ReadmeDemoPanelId,
} from './support/readmeDemo.mts';

const demoBeatPausesMs = {
    closeStarted: 2_400,
    initial: 2_200,
    participantList: 2_000,
    pollCreated: 2_000,
    resultHold: 3_600,
    voteSubmitted: 1_600,
} as const;

const demoInteractionDelaysMs = {
    afterClick: 300,
    beforeTyping: 200,
    mouseMoveSettle: 140,
    navigationSettled: 700,
    typingCharacter: 85,
} as const;
const demoMouseMoveSteps = 28;
const demoPollName = 'Member policy priorities';
const demoParticipantNames = ['Alice', 'Ben', 'Clara'] as const;
const demoChoiceNames = [
    'Data retention limits',
    'Independent incident reporting',
    'Accessibility funding',
] as const;
const demoScorecards = [
    [9, 7, 6],
    [8, 9, 5],
    [7, 6, 10],
] as const;

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

const parkMouse = async (page: Page): Promise<void> => {
    await page.mouse.move(24, 24, {
        steps: 12,
    });
    await sleep(demoInteractionDelaysMs.mouseMoveSettle);
};

const moveMouseToLocator = async (
    page: Page,
    locator: Locator,
): Promise<void> => {
    await expect(locator).toBeVisible({ timeout: 30_000 });

    const box = await locator.boundingBox();

    if (!box) {
        throw new Error('Expected a visible locator bounding box for demo motion.');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: demoMouseMoveSteps,
    });
    await sleep(demoInteractionDelaysMs.mouseMoveSettle);
};

const clickWithDemoMotion = async (
    page: Page,
    locator: Locator,
): Promise<void> => {
    await moveMouseToLocator(page, locator);
    await locator.click();
    await sleep(demoInteractionDelaysMs.afterClick);
};

const typeWithDemoMotion = async ({
    locator,
    page,
    value,
}: {
    locator: Locator;
    page: Page;
    value: string;
}): Promise<void> => {
    await clickWithDemoMotion(page, locator);
    await sleep(demoInteractionDelaysMs.beforeTyping);
    await locator.pressSequentially(value, {
        delay: demoInteractionDelaysMs.typingCharacter,
    });
    await sleep(demoInteractionDelaysMs.afterClick);
};

const gotoDemoPage = async ({
    page,
    url,
}: {
    page: Page;
    url: string;
}): Promise<void> => {
    await gotoInteractablePage(page, url);
    await parkMouse(page);
    await sleep(demoInteractionDelaysMs.navigationSettled);
};

const createPollWithDemoMotion = async ({
    page,
    pollName,
    choices = demoChoiceNames,
    skipInitialNavigation = false,
    startUrl,
}: {
    page: Page;
    pollName: string;
    choices?: readonly string[];
    skipInitialNavigation?: boolean;
    startUrl: string;
}): Promise<CreatedPoll> => {
    if (!skipInitialNavigation) {
        await gotoDemoPage({
            page,
            url: startUrl,
        });
    }

    const voteNameInput = page.getByLabel('Vote name');
    const choiceInput = page.getByLabel('Choice to vote for');
    const addChoiceButton = page.getByRole('button', {
        name: 'Add new choice',
    });
    const createVoteButton = page.getByRole('button', {
        name: 'Create vote',
    });

    await typeWithDemoMotion({
        locator: voteNameInput,
        page,
        value: pollName,
    });

    for (const choice of choices) {
        await typeWithDemoMotion({
            locator: choiceInput,
            page,
            value: choice,
        });
        await clickWithDemoMotion(page, addChoiceButton);
    }

    const createPollResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/api/polls/create'),
    );

    await clickWithDemoMotion(page, createVoteButton);
    const createPollResponse = await createPollResponsePromise;
    expect(createPollResponse.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/);
    const createdPoll = (await createPollResponse.json()) as {
        creatorToken: string;
        id: string;
        slug: string;
    };

    return {
        apiBaseUrl: new URL(createPollResponse.url()).origin,
        creatorToken: createdPoll.creatorToken,
        pollId: createdPoll.id,
        pollSlug: createdPoll.slug,
        pollUrl: page.url(),
    };
};

const submitVoteWithDemoMotion = async ({
    page,
    pollUrl,
    scores = [8, 6, 7],
    voterName,
    choices = demoChoiceNames,
}: {
    page: Page;
    pollUrl?: string;
    scores?: readonly number[];
    voterName: string;
    choices?: readonly string[];
}): Promise<void> => {
    if (pollUrl) {
        await gotoDemoPage({
            page,
            url: pollUrl,
        });
    }

    await typeWithDemoMotion({
        locator: page.getByLabel('Your public name'),
        page,
        value: voterName,
    });

    for (const [index, choice] of choices.entries()) {
        const score = scores[index];
        await clickWithDemoMotion(
            page,
            page.getByRole('button', {
                name: `Score ${choice} as ${score}`,
            }),
        );
    }

    await clickWithDemoMotion(
        page,
        page.getByRole('button', { name: 'Submit vote' }),
    );
    await expect(
        page.getByText('Vote stored on this device', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
};

const closeVotingWithDemoMotion = async (page: Page): Promise<void> => {
    const closeButton = page.getByRole('button', {
        name: 'Close voting',
    });

    await expect(closeButton).toBeVisible({ timeout: 30_000 });
    await expect(closeButton).toBeEnabled({ timeout: 30_000 });
    await clickWithDemoMotion(page, closeButton);
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

const getRecordedVideo = (page: Page, label: string): Video => {
    const video = page.video();

    if (!video) {
        throw new Error(`Expected a recorded video for the ${label} panel.`);
    }

    return video;
};

const createDisplayedAddressText = (pollUrl: string): string => {
    const parsedPollUrl = new URL(pollUrl);

    if (parsedPollUrl.hostname === '127.0.0.1') {
        parsedPollUrl.hostname = 'localhost';
    }

    return parsedPollUrl.toString();
};

const writeDemoManifest = async (
    options: {
        addressText: string;
        panels: Array<{
            id: ReadmeDemoPanelId;
            label: string;
            videoPath: string;
        }>;
    },
): Promise<void> => {
    const manifest: ReadmeDemoManifest = {
        panels: options.panels.map((panel) => ({
            ...panel,
            addressText: options.addressText,
        })),
        playbackRate: readmeDemoPlaybackRate,
        viewport: readmeDemoPanelViewport,
    };

    await fs.mkdir(path.dirname(readmeDemoManifestPath), {
        recursive: true,
    });
    await fs.writeFile(
        readmeDemoManifestPath,
        JSON.stringify(manifest, null, 2),
        'utf8',
    );
};

test('records a three-panel readme demo of the full happy-path ceremony', async ({
    browser,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const [creatorName, participantOneName, participantTwoName] =
        demoParticipantNames;
    const expectedResults = createExpectedVerifiedResults({
        choices: demoChoiceNames,
        scorecards: demoScorecards,
    });
    const demoHomeUrl = (testInfo.project.use as { baseURL?: string }).baseURL;

    if (!demoHomeUrl) {
        throw new Error(
            'The readme demo config must provide a baseURL for browser contexts.',
        );
    }

    const creator = await openProjectParticipant(browser, testInfo);
    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);

    const panels: Array<{
        id: ReadmeDemoPanelId;
        label: string;
        participant: ManagedParticipant;
        video: Video;
    }> = [
        {
            id: 'creator',
            label: 'Creator',
            participant: creator,
            video: getRecordedVideo(creator.page, 'creator'),
        },
        {
            id: 'participant-one',
            label: 'Participant 1',
            participant: participantOne,
            video: getRecordedVideo(participantOne.page, 'participant 1'),
        },
        {
            id: 'participant-two',
            label: 'Participant 2',
            participant: participantTwo,
            video: getRecordedVideo(participantTwo.page, 'participant 2'),
        },
    ];

    attachErrorTracking(creator.page, 'creator', tracker);
    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        await Promise.all(
            panels.map(({ participant }) =>
                gotoDemoPage({
                    page: participant.page,
                    url: demoHomeUrl,
                }),
            ),
        );
        await sleep(demoBeatPausesMs.initial);

        const createdPoll = await createPollWithDemoMotion({
            page: creator.page,
            pollName: demoPollName,
            skipInitialNavigation: true,
            startUrl: demoHomeUrl,
        });
        createdPolls.push(createdPoll);
        await sleep(demoBeatPausesMs.pollCreated);

        await submitVoteWithDemoMotion({
            page: creator.page,
            scores: demoScorecards[0],
            choices: demoChoiceNames,
            voterName: creatorName,
        });
        await sleep(demoBeatPausesMs.voteSubmitted);

        await submitVoteWithDemoMotion({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: demoScorecards[1],
            choices: demoChoiceNames,
            voterName: participantOneName,
        });
        await sleep(demoBeatPausesMs.voteSubmitted);

        await submitVoteWithDemoMotion({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: demoScorecards[2],
            choices: demoChoiceNames,
            voterName: participantTwoName,
        });
        await sleep(demoBeatPausesMs.voteSubmitted);

        await expectParticipantsVisible(creator.page, [
            creatorName,
            participantOneName,
            participantTwoName,
        ]);
        await sleep(demoBeatPausesMs.participantList);

        await closeVotingWithDemoMotion(creator.page);
        await Promise.all(
            panels.map(({ participant }) =>
                expectSecuringVisible(participant.page),
            ),
        );
        await sleep(demoBeatPausesMs.closeStarted);

        await waitForAutomaticReveal(creator.page);
        await Promise.all(
            panels.map(({ participant }) =>
                waitForVerifiedResults({
                    expectedResults,
                    page: participant.page,
                }),
            ),
        );
        await sleep(demoBeatPausesMs.resultHold);

        await expectNoUnexpectedErrors(tracker);

        for (const { participant } of panels) {
            await closeParticipant(participant);
        }

        await writeDemoManifest(
            {
                addressText: createDisplayedAddressText(createdPoll.pollUrl),
                panels: await Promise.all(
                    panels.map(async ({ id, label, video }) => ({
                        id,
                        label,
                        videoPath: await video.path(),
                    })),
                ),
            },
        );
    } finally {
        for (const { participant } of panels) {
            await closeParticipant(participant);
        }

        await deletePolls(request, createdPolls);
    }
});
