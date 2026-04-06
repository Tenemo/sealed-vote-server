import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { createPoll } from './support/pollFlow';
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

test('blocks duplicate voter names before registration submission', async ({
    browser,
    page,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const namespace = createTestNamespace(testInfo);
    const firstVoterName = createVoterName('alice', namespace);
    const secondVoterName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'page-1', tracker);

    const pollUrl = await createPoll({
        page,
        pollName: createPollName('Duplicate name vote', namespace),
    });

    await page.getByLabel('Voter name*').fill(firstVoterName);
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'page-2', tracker);

    try {
        await participant.page.goto(pollUrl);

        const secondVoteButton = participant.page.getByRole('button', {
            exact: true,
            name: 'Vote',
        });

        await participant.page.getByLabel('Voter name*').fill(firstVoterName);

        await expect(
            participant.page.getByText('This voter name already exists'),
        ).toBeVisible();
        await expect(secondVoteButton).toBeDisabled();

        await participant.page.getByLabel('Voter name*').fill(secondVoterName);

        await expect(
            participant.page.getByText('This voter name already exists'),
        ).toBeHidden();
        await expect(secondVoteButton).toBeEnabled();
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
    }
});
