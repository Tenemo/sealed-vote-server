import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    launchFirefoxParticipant,
} from './support/participants';
import { copyShareLink, createPoll } from './support/pollFlow';
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

test('keeps copied share links slug-based across platforms', async ({
    page,
    playwright,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const namespace = createTestNamespace(testInfo);
    attachErrorTracking(page, 'creator', tracker);

    const pollUrl = await createPoll({
        page,
        pollName: createPollName('Share link vote', namespace),
    });

    const copiedShareLink = await copyShareLink(page);
    expect(copiedShareLink).toBe(pollUrl);
    expect(copiedShareLink).toMatch(/\/votes\/[a-z0-9-]+--[0-9a-f]{8,32}$/);

    const participant = await launchFirefoxParticipant({ playwright });
    attachErrorTracking(participant.page, 'firefox-participant', tracker);

    try {
        await participant.page.goto(copiedShareLink);
        await participant.page
            .getByLabel('Voter name*')
            .fill(createVoterName('bob', namespace));
        await participant.page
            .getByRole('button', { exact: true, name: 'Vote' })
            .click();

        await expect(
            participant.page.getByText('Waiting for the vote to be started...'),
        ).toBeVisible();
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
    }
});
