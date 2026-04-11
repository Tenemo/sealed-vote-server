import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
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

test('completes the full vote-to-results ceremony across three live sessions', async ({
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
        pollName: createPollName('Full ceremony', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });

        await expectParticipantsVisible(page, [
            creatorName,
            participantOneName,
            participantTwoName,
        ]);
        await closeVoting(page);
        await expectSecuringVisible(page);
        await expectSecuringVisible(participantOne.page);
        await expectSecuringVisible(participantTwo.page);

        await waitForAutomaticReveal(page);

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });
        await expectAcceptedBallotCount({ count: 3, page });
        await expectAcceptedBallotCount({
            count: 3,
            page: participantOne.page,
        });
        await expectAcceptedBallotCount({
            count: 3,
            page: participantTwo.page,
        });

        await expectNoAxeViolations(page, 'full vote results page');
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
