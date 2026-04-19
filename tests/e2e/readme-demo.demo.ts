import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
    expect,
    test,
    type Locator,
    type Page,
    type Video,
} from '@playwright/test';

import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createExpectedVerifiedResults,
    deletePolls,
    expectPostCloseVisible,
    expectVotersVisible,
    waitForAutomaticReveal,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/poll-flow';
import {
    closeParticipant,
    openProjectParticipant,
    type ManagedParticipant,
} from './support/participants';
import {
    readmeDemoManifestPath,
    readmeDemoPanelViewport,
    readmeDemoPlaybackRate,
    type ReadmeDemoAddressPhase,
    type ReadmeDemoManifest,
    type ReadmeDemoPanelId,
} from './support/readme-demo.mts';

const demoBeatPausesMs = {
    closeStarted: 2_400,
    initial: 2_200,
    participantList: 2_000,
    pollCreated: 2_000,
    resultHold: 3_600,
    voteSubmitted: 1_600,
} as const;

const demoInteractionDelaysMs = {
    afterClick: 260,
    beforeTyping: 180,
    mouseMoveSettle: 90,
    navigationSettled: 700,
    typingCharacter: 57,
} as const;
const demoMouseMotion = {
    baseDuration: 90,
    maxDuration: 210,
    maxSteps: 18,
    minSteps: 8,
    msPerPixel: 0.24,
} as const;
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
const windowsArrowCursorDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA/0lEQVR4nO3TsWrCQBzH8f/vYkAIJKZQK32LTj5FX9GXaEbtkE1wkYC6BoeIk9ATLR2u/E9rtJq69O6W+07HLf9P/kmIEFci7PbJWYgriM7IHQJxpZRS7hA4ANwhUAPcIHAJsI/ANcAuArcB9hBoBuw/vywg0AzgNpsPwwj8DeBWq7VBBO4DuLJcasR/j2/9vthu9xRFbX0WQfpOxkO9ASl3iiiWb9nw5y8YitbjqxWAPA7n9wwkxWntSArjAHk2XF+JNMvz8XELaWZ0C9AfVj2c02ckcwbMZgvewtQYoCl+ch6ut4DOhGwXhL1n3gLEw0CETy/WAT6fz+fzkaW+AcZfRm/zFXLZAAAAAElFTkSuQmCC';

type DemoCursorPosition = {
    x: number;
    y: number;
};

const demoCursorHomePosition: DemoCursorPosition = {
    x: 24,
    y: 24,
};

const demoCursorPositions = new WeakMap<Page, DemoCursorPosition>();

const ensureDemoCursor = async (page: Page): Promise<void> => {
    await page.evaluate((cursorDataUrl) => {
        if (document.getElementById('__readme-demo-cursor')) {
            return;
        }

        const cursor = document.createElement('img');
        cursor.id = '__readme-demo-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.alt = '';
        cursor.src = cursorDataUrl;
        Object.assign(cursor.style, {
            height: '32px',
            left: '0',
            opacity: '0',
            pointerEvents: 'none',
            position: 'fixed',
            top: '0',
            transform: 'translate(0px, 0px)',
            transformOrigin: 'top left',
            width: '32px',
            willChange: 'transform',
            zIndex: '2147483647',
        } satisfies Partial<CSSStyleDeclaration>);

        (document.body ?? document.documentElement).append(cursor);
    }, windowsArrowCursorDataUrl);
};

const setDemoCursorPosition = async (
    page: Page,
    position: DemoCursorPosition,
): Promise<void> => {
    await ensureDemoCursor(page);
    await page.evaluate(({ x, y }) => {
        const cursor = document.getElementById('__readme-demo-cursor');

        if (!cursor) {
            throw new Error('Missing readme demo cursor overlay.');
        }

        cursor.style.opacity = '1';
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    }, position);
    demoCursorPositions.set(page, position);
};

const getDemoCursorPosition = (page: Page): DemoCursorPosition =>
    demoCursorPositions.get(page) ?? demoCursorHomePosition;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const easeInOutCubic = (progress: number): number =>
    progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

const createMouseMovePlan = ({
    startPosition,
    targetPosition,
}: {
    startPosition: DemoCursorPosition;
    targetPosition: DemoCursorPosition;
}): {
    delayMs: number;
    steps: number;
} => {
    const distance = Math.hypot(
        targetPosition.x - startPosition.x,
        targetPosition.y - startPosition.y,
    );
    const durationMs = clamp(
        Math.round(
            demoMouseMotion.baseDuration +
                distance * demoMouseMotion.msPerPixel,
        ),
        demoMouseMotion.baseDuration,
        demoMouseMotion.maxDuration,
    );
    const steps = clamp(
        Math.round(distance / 45),
        demoMouseMotion.minSteps,
        demoMouseMotion.maxSteps,
    );

    return {
        delayMs: durationMs / steps,
        steps,
    };
};

const moveMouseSmoothly = async (
    page: Page,
    targetPosition: DemoCursorPosition,
): Promise<void> => {
    const startPosition = getDemoCursorPosition(page);
    const movePlan = createMouseMovePlan({
        startPosition,
        targetPosition,
    });

    for (let stepIndex = 1; stepIndex <= movePlan.steps; stepIndex += 1) {
        const progress = stepIndex / movePlan.steps;
        const easedProgress = easeInOutCubic(progress);
        const nextPosition = {
            x:
                startPosition.x +
                (targetPosition.x - startPosition.x) * easedProgress,
            y:
                startPosition.y +
                (targetPosition.y - startPosition.y) * easedProgress,
        };

        await page.mouse.move(nextPosition.x, nextPosition.y);
        await setDemoCursorPosition(page, nextPosition);
        await sleep(movePlan.delayMs);
    }
};

const parkMouse = async (page: Page): Promise<void> => {
    await moveMouseSmoothly(page, demoCursorHomePosition);
    await sleep(demoInteractionDelaysMs.mouseMoveSettle);
};

const moveMouseToLocator = async (
    page: Page,
    locator: Locator,
): Promise<void> => {
    await expect(locator).toBeVisible({ timeout: 30_000 });

    const box = await locator.boundingBox();

    if (!box) {
        throw new Error(
            'Expected a visible locator bounding box for demo motion.',
        );
    }

    await moveMouseSmoothly(page, {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    });
    await sleep(demoInteractionDelaysMs.mouseMoveSettle);
};

const showDemoCursor = async (page: Page): Promise<void> => {
    await ensureDemoCursor(page);
    await setDemoCursorPosition(page, getDemoCursorPosition(page));
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
}): Promise<Page> => {
    page = await gotoInteractablePage(page, url);
    await showDemoCursor(page);
    await parkMouse(page);
    await sleep(demoInteractionDelaysMs.navigationSettled);

    return page;
};

const gotoBlankDemoPage = async (page: Page): Promise<void> => {
    await page.goto('about:blank', {
        waitUntil: 'load',
    });
    await showDemoCursor(page);
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
}): Promise<{
    createdPoll: CreatedPoll;
    page: Page;
}> => {
    if (!skipInitialNavigation) {
        page = await gotoDemoPage({
            page,
            url: startUrl,
        });
    }

    const voteNameInput = page.getByLabel('Poll name');
    const choiceInput = page.getByLabel('Choice name');
    const addChoiceButton = page.getByRole('button', {
        name: 'Add new choice',
    });
    const createVoteButton = page.getByRole('button', {
        name: 'Create poll',
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
    const createdPoll = (await createPollResponse.json()) as {
        creatorToken: string;
        id: string;
        slug: string;
    };
    const pollUrl = new URL(`/polls/${createdPoll.slug}`, startUrl).toString();

    try {
        await expect(page).toHaveURL(pollUrl, {
            timeout: 5_000,
        });
    } catch {
        page = await gotoDemoPage({
            page,
            url: pollUrl,
        });
    }

    return {
        createdPoll: {
            apiBaseUrl: new URL(createPollResponse.url()).origin,
            creatorToken: createdPoll.creatorToken,
            pollId: createdPoll.id,
            pollSlug: createdPoll.slug,
            pollUrl,
        },
        page,
    };
};

const submitVoteWithDemoMotion = async ({
    onPollPageReady,
    page,
    pollUrl,
    scores = [8, 6, 7],
    voterName,
    choices = demoChoiceNames,
}: {
    onPollPageReady?: () => void;
    page: Page;
    pollUrl?: string;
    scores?: readonly number[];
    voterName: string;
    choices?: readonly string[];
}): Promise<Page> => {
    if (pollUrl) {
        page = await gotoDemoPage({
            page,
            url: pollUrl,
        });
        onPollPageReady?.();
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

    return page;
};

const closeVotingWithDemoMotion = async (page: Page): Promise<void> => {
    const closeButton = page.getByRole('button', {
        name: 'Close voting',
    });

    await expect(closeButton).toBeVisible({ timeout: 30_000 });
    await expect(closeButton).toBeEnabled({ timeout: 30_000 });
    await clickWithDemoMotion(page, closeButton);
    await expectPostCloseVisible(page);
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

const getElapsedMs = (startedAtMs: number): number =>
    Math.max(0, Date.now() - startedAtMs);

const writeDemoManifest = async (options: {
    panels: Array<{
        addressPhases: ReadonlyArray<ReadmeDemoAddressPhase>;
        id: ReadmeDemoPanelId;
        label: string;
        videoPath: string;
    }>;
}): Promise<void> => {
    const manifest: ReadmeDemoManifest = {
        panels: options.panels.map((panel) => ({
            ...panel,
            addressPhases: [...panel.addressPhases],
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
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const recordingStartedAtMs = Date.now();
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

    const creatorHomeAddressText = createDisplayedAddressText(demoHomeUrl);
    const creator = await openProjectParticipant(browser, testInfo);
    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    let creatorHomeVisibleAtMs: number | null = null;
    let creatorPollAddressText: string | null = null;
    let creatorPollCreatedAtMs: number | null = null;
    let participantOneJoinedAtMs: number | null = null;
    let participantTwoJoinedAtMs: number | null = null;

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

    creator.page = attachCreatorTracking(creator.page);
    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);

    try {
        await Promise.all([
            (async () => {
                creator.page = attachCreatorTracking(
                    await gotoDemoPage({
                        page: creator.page,
                        url: demoHomeUrl,
                    }),
                );
            })(),
            gotoBlankDemoPage(participantOne.page),
            gotoBlankDemoPage(participantTwo.page),
        ]);
        await expect(creator.page.getByLabel('Poll name')).toBeVisible({
            timeout: 30_000,
        });
        creatorHomeVisibleAtMs = getElapsedMs(recordingStartedAtMs);
        await sleep(demoBeatPausesMs.initial);

        const createdPollResult = await createPollWithDemoMotion({
            page: creator.page,
            pollName: demoPollName,
            skipInitialNavigation: true,
            startUrl: demoHomeUrl,
        });
        creator.page = attachCreatorTracking(createdPollResult.page);
        const createdPoll = createdPollResult.createdPoll;
        createdPolls.push(createdPoll);
        creatorPollAddressText = createDisplayedAddressText(
            createdPoll.pollUrl,
        );
        creatorPollCreatedAtMs = getElapsedMs(recordingStartedAtMs);
        await sleep(demoBeatPausesMs.pollCreated);

        creator.page = attachCreatorTracking(
            await submitVoteWithDemoMotion({
                page: creator.page,
                scores: demoScorecards[0],
                choices: demoChoiceNames,
                voterName: creatorName,
            }),
        );
        await sleep(demoBeatPausesMs.voteSubmitted);

        participantOne.page = attachParticipantOneTracking(
            await submitVoteWithDemoMotion({
                onPollPageReady: () => {
                    participantOneJoinedAtMs = getElapsedMs(
                        recordingStartedAtMs,
                    );
                },
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: demoScorecards[1],
                choices: demoChoiceNames,
                voterName: participantOneName,
            }),
        );
        await sleep(demoBeatPausesMs.voteSubmitted);

        participantTwo.page = attachParticipantTwoTracking(
            await submitVoteWithDemoMotion({
                onPollPageReady: () => {
                    participantTwoJoinedAtMs = getElapsedMs(
                        recordingStartedAtMs,
                    );
                },
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: demoScorecards[2],
                choices: demoChoiceNames,
                voterName: participantTwoName,
            }),
        );
        await sleep(demoBeatPausesMs.voteSubmitted);

        await expectVotersVisible(creator.page, [
            creatorName,
            participantOneName,
            participantTwoName,
        ]);
        await sleep(demoBeatPausesMs.participantList);

        await closeVotingWithDemoMotion(creator.page);
        await Promise.all(
            panels
                .filter(({ id }) => id !== 'creator')
                .map(({ participant }) =>
                    expectPostCloseVisible(participant.page),
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

        await writeDemoManifest({
            panels: await Promise.all(
                panels.map(async ({ id, label, video }) => ({
                    addressPhases:
                        id === 'creator'
                            ? [
                                  {
                                      startMs: 0,
                                      text: '',
                                  },
                                  {
                                      startMs:
                                          creatorHomeVisibleAtMs ??
                                          getElapsedMs(recordingStartedAtMs),
                                      text: creatorHomeAddressText,
                                  },
                                  {
                                      startMs:
                                          creatorPollCreatedAtMs ??
                                          getElapsedMs(recordingStartedAtMs),
                                      text:
                                          creatorPollAddressText ??
                                          createDisplayedAddressText(
                                              createdPoll.pollUrl,
                                          ),
                                  },
                              ]
                            : [
                                  {
                                      startMs: 0,
                                      text: '',
                                  },
                                  {
                                      startMs:
                                          id === 'participant-one'
                                              ? (participantOneJoinedAtMs ??
                                                getElapsedMs(
                                                    recordingStartedAtMs,
                                                ))
                                              : (participantTwoJoinedAtMs ??
                                                getElapsedMs(
                                                    recordingStartedAtMs,
                                                )),
                                      text:
                                          creatorPollAddressText ??
                                          createDisplayedAddressText(
                                              createdPoll.pollUrl,
                                          ),
                                  },
                              ],
                    id,
                    label,
                    videoPath: await video.path(),
                })),
            ),
        });
    } finally {
        for (const { participant } of panels) {
            await closeParticipant(participant);
        }

        await deletePolls(request, createdPolls);
    }
});
