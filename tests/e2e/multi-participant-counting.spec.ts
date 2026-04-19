import { test } from '@playwright/test';

import {
    closeVoting,
    createExpectedVerifiedResults,
    createPoll,
    deletePolls,
    expectPostCloseVisible,
    expectVotersVisible,
    submitVote,
    waitForAutomaticReveal,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/poll-flow';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
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

test('counts every honest ballot when four participants complete the ceremony', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const participantThreeName = createVoterName('dylan', namespace);
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
            [10, 3],
        ],
    });

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
    const attachParticipantThreeTracking = createErrorTrackingAttacher({
        label: 'participant-three',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Four participant ceremony', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);

    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);
    participantThree.page = attachParticipantThreeTracking(
        participantThree.page,
    );

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await submitVote({
                attachPage: attachParticipantThreeTracking,
                page: participantThree.page,
                pollUrl: createdPoll.pollUrl,
                scores: [10, 3],
                voterName: participantThreeName,
            }),
        );

        await expectVotersVisible(page, [
            creatorName,
            participantOneName,
            participantTwoName,
            participantThreeName,
        ]);
        page = attachCreatorTracking(await closeVoting(page));

        await expectPostCloseVisible(page);
        await expectPostCloseVisible(participantOne.page);
        await expectPostCloseVisible(participantTwo.page);
        await expectPostCloseVisible(participantThree.page);

        page = attachCreatorTracking(await waitForAutomaticReveal(page));

        page = attachCreatorTracking(
            await waitForVerifiedResults({ expectedResults, page }),
        );
        participantOne.page = attachParticipantOneTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantOne.page,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantTwo.page,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantThree.page,
            }),
        );
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await deletePolls(request, createdPolls);
    }
});
