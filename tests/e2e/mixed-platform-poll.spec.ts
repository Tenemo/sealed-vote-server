import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    launchFirefoxParticipant,
} from './support/participants';
import {
    beginVote,
    createPoll,
    expectResultsVisible,
    getShareLinkValue,
    joinPoll,
} from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/monitoring';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/testData';

test('completes one real poll across desktop chromium, desktop firefox, and mobile firefox', async ({
    page,
    playwright,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const firefoxDesktopName = createVoterName('bob', namespace);
    const firefoxMobileName = createVoterName('cora', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const pollUrl = await createPoll({
        page,
        pollName: createPollName('Mixed platform vote', namespace),
    });

    expect(await getShareLinkValue(page)).toBe(pollUrl);

    const firefoxDesktop = await launchFirefoxParticipant({ playwright });
    const firefoxMobile = await launchFirefoxParticipant({
        playwright,
        mobile: true,
    });

    attachErrorTracking(firefoxDesktop.page, 'firefox-desktop', tracker);
    attachErrorTracking(firefoxMobile.page, 'firefox-mobile', tracker);

    try {
        await joinPoll({
            page,
            voterName: creatorName,
        });
        await joinPoll({
            page: firefoxDesktop.page,
            pollUrl,
            voterName: firefoxDesktopName,
        });
        await joinPoll({
            page: firefoxMobile.page,
            pollUrl,
            voterName: firefoxMobileName,
        });

        await beginVote(page);

        await expectResultsVisible(page);
        await expectResultsVisible(firefoxDesktop.page);
        await expectResultsVisible(firefoxMobile.page);
        await expect(
            page.getByText(
                `Voters in this poll: ${creatorName}, ${firefoxDesktopName}, ${firefoxMobileName}`,
            ),
        ).toBeVisible();
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(firefoxDesktop);
        await closeParticipant(firefoxMobile);
    }
});
