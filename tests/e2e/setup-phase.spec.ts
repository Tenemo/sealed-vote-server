import { expect, test } from '@playwright/test';

import {
    closeVoting,
    createPoll,
    deletePolls,
    expectSecuringVisible,
    reloadPollPage,
    submitVote,
    waitForReadyToReveal,
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

test('secures the frozen roster automatically across three live sessions', async ({
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

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Secure frozen roster', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);

    try {
        await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });

        await closeVoting(page);
        await reloadPollPage(page);
        await reloadPollPage(participantOne.page);
        await reloadPollPage(participantTwo.page);

        await expectSecuringVisible(page);
        await expectSecuringVisible(participantOne.page);
        await expectSecuringVisible(participantTwo.page);

        await waitForReadyToReveal(page);
        const nextStepPanel = page
            .getByRole('heading', { name: 'Your next step' })
            .locator('xpath=..');
        await expect(
            nextStepPanel.getByText(
                'Enough complete encrypted ballots are ready. Reveal results to freeze the counted set and start decryption.',
                {
                    exact: true,
                },
            ),
        ).toBeVisible({ timeout: 90_000 });
        await expect(
            page.getByRole('button', { name: 'Reveal results' }),
        ).toBeVisible({ timeout: 90_000 });
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await deletePolls(request, createdPolls);
    }
});
