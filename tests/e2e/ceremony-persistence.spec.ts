import { expect, test, type Page } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
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
    reopenProjectParticipant,
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

const continueWithoutMissingParticipants = async (
    page: Page,
): Promise<void> => {
    const continueButton = page.getByRole('button', {
        name: 'Continue without missing participants',
    });

    await expect(continueButton).toBeVisible({ timeout: 60_000 });
    const restartResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().includes('/restart-ceremony') &&
            response.ok(),
    );
    page.once('dialog', (dialog) => {
        void dialog.accept();
    });
    await continueButton.click();
    await restartResponsePromise;
};

test('automatically resumes a stored vote after a participant closes the browser before voting closes', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const participantThreeName = createVoterName('dylan', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Persist vote before close', namespace),
    });
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);

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
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: participantThreeName,
        });

        const participantOneStorageState =
            await participantOne.context.storageState();
        await closeParticipant(participantOne);

        await closeVoting(page);
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/4',
        });

        participantOne = await reopenProjectParticipant({
            browser,
            storageState: participantOneStorageState,
            testInfo,
        });
        attachErrorTracking(participantOne.page, 'participant-one-restored', tracker);
        await gotoInteractablePage(participantOne.page, createdPoll.pollUrl);
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/4',
        });

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });
        await waitForVerifiedResults({ page: participantThree.page });

        await expectAcceptedBallotCount({ count: 4, page });
        await expectAcceptedBallotCount({
            count: 4,
            page: participantOne.page,
        });

        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await deletePolls(request, createdPolls);
    }
});

test('automatically republishes a stored vote after a participant rejoins during a restarted ceremony', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const participantThreeName = createVoterName('dylan', namespace);
    const missingParticipantName = createVoterName('eve', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Persist vote after restart', namespace),
    });
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);
    const missingParticipant = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);
    attachErrorTracking(missingParticipant.page, 'missing-participant', tracker);

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
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [8, 9],
            voterName: participantThreeName,
        });
        await submitVote({
            page: missingParticipant.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantName,
        });

        await closeParticipant(missingParticipant);
        await closeVoting(page);

        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/5',
        });

        const participantOneStorageState =
            await participantOne.context.storageState();
        await closeParticipant(participantOne);

        await continueWithoutMissingParticipants(page);
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/4',
        });

        participantOne = await reopenProjectParticipant({
            browser,
            storageState: participantOneStorageState,
            testInfo,
        });
        attachErrorTracking(participantOne.page, 'participant-one-restored', tracker);
        await gotoInteractablePage(participantOne.page, createdPoll.pollUrl);

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });
        await waitForVerifiedResults({ page: participantThree.page });

        await expectAcceptedBallotCount({ count: 4, page });
        await expectAcceptedBallotCount({
            count: 4,
            page: participantOne.page,
        });
        await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '1',
        });

        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await closeParticipant(missingParticipant);
        await deletePolls(request, createdPolls);
    }
});

test('lets the organizer rescue multiple missing participants and finish with the remaining stored votes', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const missingParticipantOneName = createVoterName('dylan', namespace);
    const missingParticipantTwoName = createVoterName('eve', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Rescue multiple missing voters', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const missingParticipantOne = await openProjectParticipant(browser, testInfo);
    const missingParticipantTwo = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(
        missingParticipantOne.page,
        'missing-participant-one',
        tracker,
    );
    attachErrorTracking(
        missingParticipantTwo.page,
        'missing-participant-two',
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
            page: missingParticipantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantOneName,
        });
        await submitVote({
            page: missingParticipantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [5, 9],
            voterName: missingParticipantTwoName,
        });

        await closeParticipant(missingParticipantOne);
        await closeParticipant(missingParticipantTwo);
        await closeVoting(page);
        await waitForBlockingParticipants({
            page,
            participantNames: [
                missingParticipantOneName,
                missingParticipantTwoName,
            ],
        });

        await continueWithoutMissingParticipants(page);
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
        await waitForCeremonyMetric({
            label: 'Active ceremony roster',
            page,
            value: '3',
        });

        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(missingParticipantOne);
        await closeParticipant(missingParticipantTwo);
        await deletePolls(request, createdPolls);
    }
});

test('supports repeated organizer rescues at different securing steps', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = createVoterName('alice', namespace);
    const participantOneName = createVoterName('bob', namespace);
    const participantTwoName = createVoterName('cora', namespace);
    const participantThreeName = createVoterName('dylan', namespace);
    const missingParticipantName = createVoterName('eve', namespace);

    attachErrorTracking(page, 'creator', tracker);

    const createdPoll = await createPoll({
        page,
        pollName: createPollName('Repeated rescue', namespace),
    });
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);
    const missingParticipant = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);
    attachErrorTracking(missingParticipant.page, 'missing-participant', tracker);

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
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [8, 9],
            voterName: participantThreeName,
        });
        await submitVote({
            page: missingParticipant.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantName,
        });

        await closeParticipant(missingParticipant);
        await closeVoting(page);
        await waitForBlockingParticipants({
            page,
            participantNames: [missingParticipantName],
        });

        await continueWithoutMissingParticipants(page);
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/4',
        });
        await closeParticipant(participantThree);
        await waitForBlockingParticipants({
            page,
            participantNames: [participantThreeName],
        });

        await continueWithoutMissingParticipants(page);
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/3',
        });

        await waitForVerifiedResults({ page });
        await waitForVerifiedResults({ page: participantOne.page });
        await waitForVerifiedResults({ page: participantTwo.page });

        await expectAcceptedBallotCount({ count: 3, page });
        await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '2',
        });

        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await closeParticipant(missingParticipant);
        await deletePolls(request, createdPolls);
    }
});
