import { test } from '@playwright/test';

import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import {
    closeVoting,
    createExpectedVerifiedResults,
    createPoll,
    deletePolls,
    expectPostCloseVisible,
    expectVotersVisible,
    reloadPollPage,
    submitVote,
    waitForAutomaticReveal,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/poll-flow.ts';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants.ts';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking.ts';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/test-data.ts';

test('completes the full vote-to-results ceremony across three live sessions', async ({
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
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

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Full ceremony', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);

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

        await expectVotersVisible(page, [
            creatorName,
            participantOneName,
            participantTwoName,
        ]);
        page = attachCreatorTracking(await closeVoting(page));
        page = attachCreatorTracking(await reloadPollPage(page));
        participantOne.page = attachParticipantOneTracking(
            await reloadPollPage(participantOne.page),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await reloadPollPage(participantTwo.page),
        );
        await expectPostCloseVisible(page);
        await expectPostCloseVisible(participantOne.page);
        await expectPostCloseVisible(participantTwo.page);

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

        await expectNoAccessibilityViolations(page, 'full vote results page');
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
