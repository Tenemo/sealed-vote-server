import { expect, test, type Page } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import {
    closeVoting,
    createExpectedVerifiedResults,
    createPoll,
    deletePolls,
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
            [10, 3],
        ],
    });

    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Persist vote before close', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);

    try {
        page = await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        participantOne.page = await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        participantTwo.page = await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });
        participantThree.page = await submitVote({
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
        participantOne.page = await gotoInteractablePage(
            participantOne.page,
            createdPoll.pollUrl,
        );
        await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/4',
        });

        await waitForVerifiedResults({ expectedResults, page });
        await waitForVerifiedResults({
            expectedResults,
            page: participantOne.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantTwo.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantThree.page,
        });

        await expectNoUnexpectedErrors(tracker);
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
            [8, 9],
        ],
    });

    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Persist vote after restart', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);
    let missingParticipant = await openProjectParticipant(browser, testInfo);

    attachErrorTracking(participantOne.page, 'participant-one', tracker);
    attachErrorTracking(participantTwo.page, 'participant-two', tracker);
    attachErrorTracking(participantThree.page, 'participant-three', tracker);
    attachErrorTracking(missingParticipant.page, 'missing-participant', tracker);

    try {
        page = await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        participantOne.page = await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        participantTwo.page = await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });
        participantThree.page = await submitVote({
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [8, 9],
            voterName: participantThreeName,
        });
        missingParticipant.page = await submitVote({
            page: missingParticipant.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantName,
        });

        const missingParticipantStorageState =
            await missingParticipant.context.storageState();
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
        participantOne.page = await gotoInteractablePage(
            participantOne.page,
            createdPoll.pollUrl,
        );

        await waitForVerifiedResults({ expectedResults, page });
        await waitForVerifiedResults({
            expectedResults,
            page: participantOne.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantTwo.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantThree.page,
        });
        await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '1',
        });

        missingParticipant = await reopenProjectParticipant({
            browser,
            storageState: missingParticipantStorageState,
            testInfo,
        });
        attachErrorTracking(
            missingParticipant.page,
            'missing-participant-reopened',
            tracker,
        );
        missingParticipant.page = await gotoInteractablePage(
            missingParticipant.page,
            createdPoll.pollUrl,
        );
        await expect(
            missingParticipant.page.getByText(
                'The organizer continued without this device. Your locally stored vote was not counted for this closed vote.',
            ).first(),
        ).toBeVisible({ timeout: 30_000 });

        await expectNoUnexpectedErrors(tracker);
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
        ],
    });

    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Rescue multiple missing voters', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
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
        page = await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        participantOne.page = await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        participantTwo.page = await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });
        missingParticipantOne.page = await submitVote({
            page: missingParticipantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [10, 3],
            voterName: missingParticipantOneName,
        });
        missingParticipantTwo.page = await submitVote({
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

        await waitForVerifiedResults({ expectedResults, page });
        await waitForVerifiedResults({
            expectedResults,
            page: participantOne.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantTwo.page,
        });
        await waitForCeremonyMetric({
            label: 'Active ceremony roster',
            page,
            value: '3',
        });

        await expectNoUnexpectedErrors(tracker);
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
    const expectedResults = createExpectedVerifiedResults({
        choices: ['Apples', 'Bananas'],
        scorecards: [
            [9, 4],
            [6, 8],
            [7, 5],
        ],
    });

    attachErrorTracking(page, 'creator', tracker);

    const createdPollResult = await createPoll({
        page,
        pollName: createPollName('Repeated rescue', namespace),
    });
    page = createdPollResult.page;
    const createdPoll = createdPollResult.createdPoll;
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
        page = await submitVote({
            page,
            scores: [9, 4],
            voterName: creatorName,
        });
        participantOne.page = await submitVote({
            page: participantOne.page,
            pollUrl: createdPoll.pollUrl,
            scores: [6, 8],
            voterName: participantOneName,
        });
        participantTwo.page = await submitVote({
            page: participantTwo.page,
            pollUrl: createdPoll.pollUrl,
            scores: [7, 5],
            voterName: participantTwoName,
        });
        participantThree.page = await submitVote({
            page: participantThree.page,
            pollUrl: createdPoll.pollUrl,
            scores: [8, 9],
            voterName: participantThreeName,
        });
        missingParticipant.page = await submitVote({
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

        await waitForVerifiedResults({ expectedResults, page });
        await waitForVerifiedResults({
            expectedResults,
            page: participantOne.page,
        });
        await waitForVerifiedResults({
            expectedResults,
            page: participantTwo.page,
        });
        await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '2',
        });

        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await closeParticipant(missingParticipant);
        await deletePolls(request, createdPolls);
    }
});
