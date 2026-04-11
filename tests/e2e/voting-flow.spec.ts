import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import {
    deletePolls,
    expectBoardCeremonyVisible,
    expectParticipantsVisible,
    registerParticipant,
    reloadPollPage,
    startVoting,
    createPoll,
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

test('completes the open waiting-room and start flow on every required browser project', async ({
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
        pollName: createPollName('Board ceremony flow', namespace),
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
        await expectParticipantsVisible(page, [
            creatorName,
            participantOneName,
            participantTwoName,
        ]);
        await expectNoAxeViolations(page, 'started poll page');
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
