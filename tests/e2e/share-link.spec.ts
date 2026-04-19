import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    submitVote,
    type CreatedPoll,
} from './support/poll-flow';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/test-data';

test('keeps slug-based poll links shareable in a separate participant context', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Share link vote', namespace);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantTracking = createErrorTrackingAttacher({
        label: 'participant',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName,
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    expect(createdPoll.pollUrl).toMatch(/\/polls\/[a-z0-9-]+--[0-9a-f]{4}$/);

    const participant = await openProjectParticipant(browser, testInfo);
    participant.page = attachParticipantTracking(participant.page);

    try {
        participant.page = attachParticipantTracking(
            await gotoInteractablePage(participant.page, createdPoll.pollUrl),
        );
        await expect(
            participant.page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(participant.page.getByText(/Voting open/i)).toBeVisible();
        await expect(
            participant.page.getByRole('heading', { name: 'Your next step' }),
        ).toBeVisible();

        participant.page = attachParticipantTracking(
            await submitVote({
                page: participant.page,
                scores: [8, 6],
                voterName: createVoterName('bob', namespace),
            }),
        );
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});

test('keeps the copy-link button vertically stable while copy feedback is visible', async ({
    page,
    request,
}, testInfo) => {
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);

    await page.setViewportSize({ height: 900, width: 1280 });
    await page.addInitScript(() => {
        (
            window as typeof window & {
                __copiedShareUrls?: string[];
            }
        ).__copiedShareUrls = [];

        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (value: string) => {
                    (
                        window as typeof window & {
                            __copiedShareUrls?: string[];
                        }
                    ).__copiedShareUrls?.push(value);
                },
            },
        });
    });

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Copy link layout', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    try {
        const copyButton = page.getByRole('button', {
            name: 'Copy link',
        });
        await expect(copyButton).toBeVisible();

        const beforeBox = await copyButton.boundingBox();
        expect(beforeBox).not.toBeNull();

        const expectedShareUrl = page.url();
        await copyButton.click();
        await expect(page.getByText('Link copied.', { exact: true })).toBeVisible();
        const copiedShareUrls = await page.evaluate(
            () =>
                (
                    window as typeof window & {
                        __copiedShareUrls?: string[];
                    }
                ).__copiedShareUrls ?? [],
        );

        expect(copiedShareUrls).toEqual([expectedShareUrl]);

        const afterBox = await copyButton.boundingBox();
        expect(afterBox).not.toBeNull();

        expect(Math.abs((afterBox?.y ?? 0) - (beforeBox?.y ?? 0))).toBeLessThanOrEqual(
            1,
        );
    } finally {
        await deletePolls(request, createdPolls);
    }
});
