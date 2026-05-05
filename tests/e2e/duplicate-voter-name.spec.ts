import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants.ts';
import {
    createPoll,
    deletePolls,
    submitVote,
    type CreatedPoll,
} from './support/poll-flow.ts';
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

test('shows the duplicate voter-name error and still allows a unique retry', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const firstVoterName = createVoterName('alice', namespace);
    const secondVoterName = createVoterName('bob', namespace);
    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'page-1',
        tracker,
    });
    const attachParticipantTracking = createErrorTrackingAttacher({
        label: 'page-2',
        options: {
            allowedApiStatuses: [409],
            allowedConsoleErrors: [
                /Failed to load resource: the server responded with a status of 409/u,
            ],
        },
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Duplicate name vote', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    page = attachCreatorTracking(
        await submitVote({
            page,
            scores: [9, 4],
            voterName: firstVoterName,
        }),
    );

    const participant = await openProjectParticipant(browser, testInfo);
    participant.page = attachParticipantTracking(participant.page);

    try {
        participant.page = attachParticipantTracking(
            await gotoInteractablePage(participant.page, createdPoll.pollUrl),
        );

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
                'Voter name is already taken for this poll.',
            ),
        ).toBeVisible();
        await expectNoAccessibilityViolations(
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
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
