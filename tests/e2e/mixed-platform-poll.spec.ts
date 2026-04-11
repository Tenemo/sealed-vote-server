import { test } from '@playwright/test';

import {
    closeVoting,
    createPoll,
    deletePolls,
    expectAcceptedBallotCount,
    expectParticipantsVisible,
    expectSecuringVisible,
    submitVote,
    waitForAutomaticReveal,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/pollFlow';
import {
    closeParticipant,
    launchFirefoxParticipant,
} from './support/participants';
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

test('completes one real ceremony across chromium, desktop firefox, and mobile firefox', async ({
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
        pollName: createPollName('Mixed platform ceremony', namespace),
    });
    createdPolls.push(createdPoll);

    const firefoxDesktop = await launchFirefoxParticipant({ playwright });
    const firefoxMobile = await launchFirefoxParticipant({
        playwright,
        mobile: true,
    });

    attachErrorTracking(firefoxDesktop.page, 'firefox-desktop', tracker);
    attachErrorTracking(firefoxMobile.page, 'firefox-mobile', tracker);

    try {
        await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        await submitVote({
            page: firefoxDesktop.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: firefoxDesktopName,
        });
        await submitVote({
            page: firefoxMobile.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: firefoxMobileName,
        });

        await expectParticipantsVisible(page, [
            creatorName,
            firefoxDesktopName,
            firefoxMobileName,
        ]);
        await closeVoting(page);

        await expectSecuringVisible(page);
        await expectSecuringVisible(firefoxDesktop.page);
        await expectSecuringVisible(firefoxMobile.page);

        await waitForAutomaticReveal(page);

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: firefoxDesktop.page });
        await waitForVerifiedResults({ page: firefoxMobile.page });
        await expectAcceptedBallotCount({ count: 3, page });
        await expectAcceptedBallotCount({
            count: 3,
            page: firefoxDesktop.page,
        });
        await expectAcceptedBallotCount({
            count: 3,
            page: firefoxMobile.page,
        });
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(firefoxDesktop);
        await closeParticipant(firefoxMobile);
        await deletePolls(request, createdPolls);
    }
});
