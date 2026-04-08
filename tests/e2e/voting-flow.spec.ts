import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import {
    beginVote,
    createPoll,
    deletePolls,
    expectParticipantsVisible,
    expectResultsVisible,
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

test('completes the poll happy path on every required browser project', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('E2E lifecycle', namespace),
    });
    createdPolls.push(createdPoll);
    await expectNoAxeViolations(page, 'created vote page');

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'participant', tracker);

    try {
        await joinPoll({
            page,
            voterName: creatorName,
        });
        await joinPoll({
            page: participant.page,
            pollUrl: createdPoll.pollUrl,
            voterName: participantName,
        });
        await expectNoAxeViolations(page, 'creator waiting page');
        await expectNoAxeViolations(participant.page, 'participant waiting page');

        await beginVote(page);

        await expectResultsVisible(page);
        await expectResultsVisible(participant.page);
        await expectNoAxeViolations(page, 'creator results page');
        await expectNoAxeViolations(participant.page, 'participant results page');
        await expectParticipantsVisible(page, [creatorName, participantName]);
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
