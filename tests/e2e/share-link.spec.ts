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
    createErrorTrackingAttacher,
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
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Share link vote', namespace);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantTracking = createErrorTrackingAttacher({
        label: 'participant',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName,
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    expect(createdPoll.pollUrl).toMatch(/\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/);

    const participant = await openProjectParticipant(browser, testInfo);
    participant.page = attachParticipantTracking(participant.page);

    try {
        participant.page = attachParticipantTracking(
            await gotoInteractablePage(participant.page, createdPoll.pollUrl),
        );
        await expect(
            participant.page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(participant.page.getByText(/Voting open/i)).toBeVisible();
        await expect(
            participant.page.getByRole('heading', { name: 'Your next step' }),
        ).toBeVisible();

        participant.page = attachParticipantTracking(
            await submitVote({
                page: participant.page,
                scores: [8, 6],
                voterName: createVoterName('bob', namespace),
            }),
        );
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
