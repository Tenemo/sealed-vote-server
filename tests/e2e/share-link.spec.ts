import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    submitVote,
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

test('keeps slug-based poll links shareable in a separate participant context', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Share link vote', namespace);
    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName,
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    expect(createdPoll.pollUrl).toMatch(/\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/);

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'participant', tracker);

    try {
        participant.page = await gotoInteractablePage(
            participant.page,
            createdPoll.pollUrl,
        );
        await expect(
            participant.page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(participant.page.getByText(/Voting open/i)).toBeVisible();
        await expect(
            participant.page.getByRole('heading', { name: 'Your next step' }),
        ).toBeVisible();

        participant.page = await submitVote({
            page: participant.page,
            scores: [8, 6],
            voterName: createVoterName('bob', namespace),
        });
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
