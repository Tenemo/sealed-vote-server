import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
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

test('shows the duplicate voter-name error and still allows a unique retry', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const firstVoterName = createVoterName('alice', namespace);
    const secondVoterName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'page-1', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Duplicate name vote', namespace),
    });
    createdPolls.push(createdPoll);

    await submitVote({
        page,
        scores: [9, 4],
        voterName: firstVoterName,
    });

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'page-2', tracker, {
        allowedApiStatuses: [409],
    });

    try {
        await gotoInteractablePage(participant.page, createdPoll.pollUrl);

        await participant.page
            .getByLabel('Your public name')
            .fill(firstVoterName);
        await participant.page
            .getByRole('button', { name: 'Score Apples as 8' })
            .click();
        await participant.page
            .getByRole('button', { name: 'Score Bananas as 6' })
            .click();
        await participant.page
            .getByRole('button', { exact: true, name: 'Submit vote' })
            .click();

        await expect(
            participant.page.getByText(
                'Voter name is already taken for this vote.',
            ),
        ).toBeVisible();
        await expectNoAxeViolations(
            participant.page,
            'duplicate voter name validation state',
        );

        await participant.page
            .getByLabel('Your public name')
            .fill(secondVoterName);
        await participant.page
            .getByRole('button', { exact: true, name: 'Submit vote' })
            .click();

        await expect(
            participant.page.getByText('Vote stored on this device', {
                exact: true,
            }),
        ).toBeVisible({ timeout: 30_000 });
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
