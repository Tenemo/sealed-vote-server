import { expect, test } from '@playwright/test';

import {
    createPoll,
    deletePolls,
    expectBoardCeremonyVisible,
    registerParticipant,
    reloadPollPage,
    startVoting,
    type CreatedPoll,
} from './support/pollFlow';
import {
    closeParticipant,
    openProjectParticipant,
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

test('completes the explicit manifest setup phase across three live sessions', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Manifest setup phase', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        await registerParticipant({
            page,
            voterName: creatorName,
        });
        await registerParticipant({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            voterName: participantOneName,
        });
        await registerParticipant({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            voterName: participantTwoName,
        });

        await startVoting(page);
        await reloadPollPage(page);
        await reloadPollPage(participantOne.page);
        await reloadPollPage(participantTwo.page);

        await expectBoardCeremonyVisible(page);
        await expectBoardCeremonyVisible(participantOne.page);
        await expectBoardCeremonyVisible(participantTwo.page);

        await reloadPollPage(page);

        await expect(
            page.getByText(/^Phase 0 is complete\./).first(),
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.getByText('Registrations on board').locator('..').getByText(
                '3/3',
            ),
        ).toBeVisible();
        await expect(
            page.getByText('Phase 0 / manifest-publication').first(),
        ).toBeVisible();
        await expect(
            page.getByText('Phase 0 / manifest-acceptance').first(),
        ).toBeVisible();
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
