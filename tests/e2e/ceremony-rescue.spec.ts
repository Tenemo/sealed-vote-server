import { expect, test } from '@playwright/test';

import {
    closeVoting,
    createPoll,
    deletePolls,
    expectAcceptedBallotCount,
    submitVote,
    waitForBlockingParticipants,
    waitForCeremonyMetric,
    waitForVerifiedResults,
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
import { gotoInteractablePage } from './support/navigation.mts';

test('the organizer can continue without a missing participant and finish with the remaining ballots', async ({
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
    const missingParticipantName = createVoterName('dylan', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Ceremony rescue', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const missingParticipant = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(
        missingParticipant.page,
        'missing-participant',
        tracker,
    );

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
        await submitVote({
            page: missingParticipant.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantName,
        });

        await missingParticipant.page.close();
        await closeVoting(page);
        await waitForBlockingParticipants({
            page,
            participantNames: [missingParticipantName],
        });

        const continueButton = page.getByRole('button', {
            name: 'Continue without missing participants',
        });
        await expect(continueButton).toBeVisible({ timeout: 60_000 });

        const restartResponsePromise = page.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                response.url().includes('/restart-ceremony'),
        );
        page.once('dialog', (dialog) => {
            void dialog.accept();
        });
        await continueButton.click();
        expect((await restartResponsePromise).ok()).toBeTruthy();
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/3',
        });

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });

        await expectAcceptedBallotCount({ count: 3, page });
        await expectAcceptedBallotCount({
            count: 3,
            page: participantOne.page,
        });
        await expectAcceptedBallotCount({
            count: 3,
            page: participantTwo.page,
        });

        const reopenedMissingPage = await missingParticipant.context.newPage();
        attachErrorTracking(
            reopenedMissingPage,
            'missing-participant-reopened',
            tracker,
        );
        await gotoInteractablePage(reopenedMissingPage, createdPoll.pollUrl);
        await expect(
            reopenedMissingPage.getByText(
                'The organizer continued without this device. Your locally stored vote was not counted for this closed vote.',
            ).first(),
        ).toBeVisible({ timeout: 30_000 });

        expectNoUnexpectedErrors(tracker);
        await reopenedMissingPage.close();
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(missingParticipant);
        await deletePolls(request, createdPolls);
    }
});
