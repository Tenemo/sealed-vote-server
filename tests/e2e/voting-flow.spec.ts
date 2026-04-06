import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import {
    beginVote,
    createPoll,
    deletePolls,
    expectResultsVisible,
    joinPoll,
    type CreatedPoll,
} from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/monitoring';
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

        await beginVote(page);

        await expectResultsVisible(page);
        await expectResultsVisible(participant.page);
        await expect(
            page.getByText(`Voters in this poll: ${creatorName}, ${participantName}`),
        ).toBeVisible();
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
