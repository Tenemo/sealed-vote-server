import { test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import {
    closeVoting,
    createExpectedVerifiedResults,
    createPoll,
    deletePolls,
    expectPostCloseVisible,
    expectParticipantsVisible,
    reloadPollPage,
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
        ],
    });

    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Full ceremony', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        page = await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        participantOne.page = await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        participantTwo.page = await submitVote({
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
        page = await reloadPollPage(page);
        participantOne.page = await reloadPollPage(participantOne.page);
        participantTwo.page = await reloadPollPage(participantTwo.page);
        await expectPostCloseVisible(page);
        await expectPostCloseVisible(participantOne.page);
        await expectPostCloseVisible(participantTwo.page);

        await waitForAutomaticReveal(page);

        await waitForVerifiedResults({ expectedResults, page });
        await waitForVerifiedResults({
            expectedResults,
            page: participantOne.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantTwo.page,
        });

        await expectNoAxeViolations(page, 'full vote results page');
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
