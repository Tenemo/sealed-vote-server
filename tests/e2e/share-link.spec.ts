import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    launchFirefoxParticipant,
} from './support/participants';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    registerParticipant,
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

test('keeps slug-based poll links shareable across platforms', async ({
    page,
    playwright,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = createPollName('Share link vote', namespace);
    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName,
    });
    createdPolls.push(createdPoll);

    expect(createdPoll.pollUrl).toMatch(/\/votes\/[a-z0-9-]+--[0-9a-f]{4}$/);

    const participant = await launchFirefoxParticipant({ playwright });
    attachErrorTracking(participant.page, 'firefox-participant', tracker);

    try {
        await gotoInteractablePage(participant.page, createdPoll.pollUrl);
        await expect(
            participant.page.getByRole('heading', { name: pollName }),
        ).toBeVisible();
        await expect(
            participant.page.getByText(/Waiting room open/i),
        ).toBeVisible();
        await expect(
            participant.page.getByRole('heading', { name: 'Join this vote' }),
        ).toBeVisible();

        await registerParticipant({
            page: participant.page,
            voterName: createVoterName('bob', namespace),
        });
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
