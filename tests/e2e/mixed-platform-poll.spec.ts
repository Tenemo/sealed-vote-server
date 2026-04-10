import { test } from '@playwright/test';

import {
    closeRegistrations,
    createPoll,
    deletePolls,
    expectBoardCeremonyVisible,
    expectParticipantsVisible,
    registerParticipant,
    reloadPollPage,
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

test('closes one real ceremony across chromium, desktop firefox, and mobile firefox', async ({
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
        await registerParticipant({
            page,
            voterName: creatorName,
        });
        await registerParticipant({
            page: firefoxDesktop.page,
            pollUrl: createdPoll.pollUrl,
            voterName: firefoxDesktopName,
        });
        await registerParticipant({
            page: firefoxMobile.page,
            pollUrl: createdPoll.pollUrl,
            voterName: firefoxMobileName,
        });

        await closeRegistrations(page);
        await reloadPollPage(page);
        await reloadPollPage(firefoxDesktop.page);
        await reloadPollPage(firefoxMobile.page);

        await expectBoardCeremonyVisible(page);
        await expectBoardCeremonyVisible(firefoxDesktop.page);
        await expectBoardCeremonyVisible(firefoxMobile.page);
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
