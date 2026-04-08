import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    launchFirefoxParticipant,
} from './support/participants';
import {
    beginVote,
    createPoll,
    deletePolls,
    expectParticipantsVisible,
    expectResultsVisible,
    getShareLinkValue,
    joinPoll,
    type CreatedPoll,
} from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/testData';

test('completes one real poll across desktop chromium, desktop firefox, and mobile firefox', async ({
    page,
    playwright,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const firefoxDesktopName = createVoterName('bob', namespace);
    const firefoxMobileName = createVoterName('cora', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Mixed platform vote', namespace),
    });
    createdPolls.push(createdPoll);

    expect(await getShareLinkValue(page)).toBe(createdPoll.pollUrl);

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
            pollUrl: createdPoll.pollUrl,
            voterName: firefoxDesktopName,
        });
        await joinPoll({
            page: firefoxMobile.page,
            pollUrl: createdPoll.pollUrl,
            voterName: firefoxMobileName,
        });

        await beginVote(page);

        await expectResultsVisible(page);
        await expectResultsVisible(firefoxDesktop.page);
        await expectResultsVisible(firefoxMobile.page);
        await expectParticipantsVisible(page, [
            creatorName,
            firefoxDesktopName,
            firefoxMobileName,
        ]);
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(firefoxDesktop);
        await closeParticipant(firefoxMobile);
        await deletePolls(request, createdPolls);
    }
});
