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

test('counts every honest ballot when four participants complete the ceremony', async ({
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
    const participantThreeName = createVoterName('dylan', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Four participant ceremony', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);

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
        await submitVote({
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: participantThreeName,
        });

        await expectParticipantsVisible(page, [
            creatorName,
            participantOneName,
            participantTwoName,
            participantThreeName,
        ]);
        await closeVoting(page);

        await expectSecuringVisible(page);
        await expectSecuringVisible(participantOne.page);
        await expectSecuringVisible(participantTwo.page);
        await expectSecuringVisible(participantThree.page);

        await waitForAutomaticReveal(page);

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });
        await waitForVerifiedResults({ page: participantThree.page });

        await expectAcceptedBallotCount({ count: 4, page });
        await expectAcceptedBallotCount({
            count: 4,
            page: participantOne.page,
        });
        await expectAcceptedBallotCount({
            count: 4,
            page: participantTwo.page,
        });
        await expectAcceptedBallotCount({
            count: 4,
            page: participantThree.page,
        });
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await deletePolls(request, createdPolls);
    }
});
