import { expect, test, type Page } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import {
    bringPollPagesToFront,
    closeVoting,
    createExpectedVerifiedResults,
    createPoll,
    deletePolls,
    reloadPollPage,
    submitVote,
    waitForBlockingVoters,
    waitForCeremonyMetric,
    waitForVerifiedResults,
    type CreatedPoll,
} from './support/poll-flow';
import {
    closeParticipant,
    openProjectParticipant,
    reopenProjectParticipant,
} from './support/participants';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import {
    createPollName,
    createTestNamespace,
    createVoterName,
} from './support/test-data';

const restartCeremonyWithoutBlockingVoters = async (
    page: Page,
): Promise<Page> => {
    const waitForRestartButton = async (
        candidatePage: Page,
        timeout: number,
    ): Promise<void> => {
        await expect(
            candidatePage.getByRole('button', {
                name: 'Restart ceremony without blocking voters',
            }),
        ).toBeVisible({ timeout });
    };

    await page.bringToFront();

    try {
        await waitForRestartButton(page, 30_000);
    } catch {
        page = await reloadPollPage(page);
        await waitForRestartButton(page, 60_000);
    }

    const restartButton = page.getByRole('button', {
        name: 'Restart ceremony without blocking voters',
    });

    const restartResponsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().includes('/restart-ceremony') &&
            response.ok(),
    );
    page.once('dialog', (dialog) => {
        void dialog.accept();
    });
    await restartButton.click();
    await restartResponsePromise;
    return page;
};

test('automatically resumes a stored vote after a participant closes the browser before voting closes', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker({ testInfo });
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

    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    const attachParticipantThreeTracking = createErrorTrackingAttacher({
        label: 'participant-three',
        tracker,
    });
    const attachParticipantOneRestoredTracking = createErrorTrackingAttacher({
        label: 'participant-one-restored',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Persist vote before close', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);

    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);
    participantThree.page = attachParticipantThreeTracking(
        participantThree.page,
    );

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await submitVote({
                attachPage: attachParticipantThreeTracking,
                page: participantThree.page,
                pollUrl: createdPoll.pollUrl,
                scores: [10, 3],
                voterName: participantThreeName,
            }),
        );

        const participantOneStorageState =
            await participantOne.context.storageState();
        await closeParticipant(participantOne);

        page = attachCreatorTracking(await closeVoting(page));
        [participantTwo.page, participantThree.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantTwoTracking,
                    attachParticipantThreeTracking,
                ],
                pages: [participantTwo.page, participantThree.page],
            });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/4',
        }));

        participantOne = await reopenProjectParticipant({
            browser,
            storageState: participantOneStorageState,
            testInfo,
        });
        participantOne.page = attachParticipantOneRestoredTracking(
            participantOne.page,
        );
        participantOne.page = attachParticipantOneRestoredTracking(
            await gotoInteractablePage(participantOne.page, createdPoll.pollUrl),
        );
        [participantOne.page] = await bringPollPagesToFront({
            attachPages: [attachParticipantOneRestoredTracking],
            pages: [participantOne.page],
        });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/4',
        }));

        page = attachCreatorTracking(
            await waitForVerifiedResults({ expectedResults, page }),
        );
        participantOne.page = attachParticipantOneRestoredTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantOne.page,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantTwo.page,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantThree.page,
            }),
        );

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

    const tracker = createUnexpectedErrorTracker({ testInfo });
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

    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    const attachParticipantThreeTracking = createErrorTrackingAttacher({
        label: 'participant-three',
        tracker,
    });
    const attachMissingParticipantTracking = createErrorTrackingAttacher({
        label: 'missing-participant',
        tracker,
    });
    const attachParticipantOneRestoredTracking = createErrorTrackingAttacher({
        label: 'participant-one-restored',
        tracker,
    });
    const attachMissingParticipantReopenedTracking =
        createErrorTrackingAttacher({
            label: 'missing-participant-reopened',
            tracker,
        });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Persist vote after restart', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    let participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);
    let missingParticipant = await openProjectParticipant(browser, testInfo);

    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);
    participantThree.page = attachParticipantThreeTracking(
        participantThree.page,
    );
    missingParticipant.page = attachMissingParticipantTracking(
        missingParticipant.page,
    );

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await submitVote({
                attachPage: attachParticipantThreeTracking,
                page: participantThree.page,
                pollUrl: createdPoll.pollUrl,
                scores: [8, 9],
                voterName: participantThreeName,
            }),
        );
        missingParticipant.page = attachMissingParticipantTracking(
            await submitVote({
                attachPage: attachMissingParticipantTracking,
                page: missingParticipant.page,
                pollUrl: createdPoll.pollUrl,
                scores: [10, 3],
                voterName: missingParticipantName,
            }),
        );

        const missingParticipantStorageState =
            await missingParticipant.context.storageState();
        await closeParticipant(missingParticipant);
        page = attachCreatorTracking(await closeVoting(page));
        [
            participantOne.page,
            participantTwo.page,
            participantThree.page,
        ] = await bringPollPagesToFront({
            attachPages: [
                attachParticipantOneTracking,
                attachParticipantTwoTracking,
                attachParticipantThreeTracking,
            ],
            pages: [
                participantOne.page,
                participantTwo.page,
                participantThree.page,
            ],
        });

        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/5',
        }));

        const participantOneStorageState =
            await participantOne.context.storageState();
        await closeParticipant(participantOne);

        page = attachCreatorTracking(
            await restartCeremonyWithoutBlockingVoters(page),
        );
        [participantTwo.page, participantThree.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantTwoTracking,
                    attachParticipantThreeTracking,
                ],
                pages: [participantTwo.page, participantThree.page],
            });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/4',
        }));

        participantOne = await reopenProjectParticipant({
            browser,
            storageState: participantOneStorageState,
            testInfo,
        });
        participantOne.page = attachParticipantOneRestoredTracking(
            participantOne.page,
        );
        participantOne.page = attachParticipantOneRestoredTracking(
            await gotoInteractablePage(participantOne.page, createdPoll.pollUrl),
        );
        [participantOne.page] = await bringPollPagesToFront({
            attachPages: [
                attachParticipantOneRestoredTracking,
            ],
            pages: [
                participantOne.page,
            ],
        });
        [participantTwo.page, participantThree.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantTwoTracking,
                    attachParticipantThreeTracking,
                ],
                pages: [
                    participantTwo.page,
                    participantThree.page,
                ],
            });

        page = attachCreatorTracking(
            await waitForVerifiedResults({ expectedResults, page }),
        );
        participantOne.page = attachParticipantOneRestoredTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantOne.page,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantTwo.page,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantThree.page,
            }),
        );
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '1',
        }));

        missingParticipant = await reopenProjectParticipant({
            browser,
            storageState: missingParticipantStorageState,
            testInfo,
        });
        missingParticipant.page = attachMissingParticipantReopenedTracking(
            missingParticipant.page,
        );
        missingParticipant.page = attachMissingParticipantReopenedTracking(
            await gotoInteractablePage(
                missingParticipant.page,
                createdPoll.pollUrl,
            ),
        );
        await expect(
            missingParticipant.page.getByText(
                'The creator restarted the ceremony without this voter. Your locally stored vote was not counted for this closed vote.',
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

test('lets the creator restart the ceremony without blocking voters and finish with the remaining stored votes', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker({ testInfo });
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

    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    const attachMissingParticipantOneTracking = createErrorTrackingAttacher({
        label: 'missing-participant-one',
        tracker,
    });
    const attachMissingParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'missing-participant-two',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName(
            'Restart ceremony without blocking voters',
            namespace,
        ),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const missingParticipantOne = await openProjectParticipant(browser, testInfo);
    const missingParticipantTwo = await openProjectParticipant(browser, testInfo);

    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);
    missingParticipantOne.page = attachMissingParticipantOneTracking(
        missingParticipantOne.page,
    );
    missingParticipantTwo.page = attachMissingParticipantTwoTracking(
        missingParticipantTwo.page,
    );

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );
        missingParticipantOne.page = attachMissingParticipantOneTracking(
            await submitVote({
                attachPage: attachMissingParticipantOneTracking,
                page: missingParticipantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [10, 3],
                voterName: missingParticipantOneName,
            }),
        );
        missingParticipantTwo.page = attachMissingParticipantTwoTracking(
            await submitVote({
                attachPage: attachMissingParticipantTwoTracking,
                page: missingParticipantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [5, 9],
                voterName: missingParticipantTwoName,
            }),
        );

        await closeParticipant(missingParticipantOne);
        await closeParticipant(missingParticipantTwo);
        page = attachCreatorTracking(await closeVoting(page));
        [participantOne.page, participantTwo.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantOneTracking,
                    attachParticipantTwoTracking,
                ],
                pages: [participantOne.page, participantTwo.page],
            });
        page = attachCreatorTracking(await waitForBlockingVoters({
            page,
            voterNames: [
                missingParticipantOneName,
                missingParticipantTwoName,
            ],
        }));

        page = attachCreatorTracking(
            await restartCeremonyWithoutBlockingVoters(page),
        );
        [participantOne.page, participantTwo.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantOneTracking,
                    attachParticipantTwoTracking,
                ],
                pages: [participantOne.page, participantTwo.page],
            });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/3',
        }));

        page = attachCreatorTracking(
            await waitForVerifiedResults({ expectedResults, page }),
        );
        participantOne.page = attachParticipantOneTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantOne.page,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantTwo.page,
            }),
        );
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Active ceremony roster',
            page,
            value: '3',
        }));

        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(missingParticipantOne);
        await closeParticipant(missingParticipantTwo);
        await deletePolls(request, createdPolls);
    }
});

test('supports repeated creator ceremony restarts without blocking voters at different securing steps', async ({
    browser,
    page,
    request,
}, testInfo) => {
    test.slow();

    const tracker = createUnexpectedErrorTracker({ testInfo });
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

    const attachCreatorTracking = createErrorTrackingAttacher({
        label: 'creator',
        tracker,
    });
    const attachParticipantOneTracking = createErrorTrackingAttacher({
        label: 'participant-one',
        tracker,
    });
    const attachParticipantTwoTracking = createErrorTrackingAttacher({
        label: 'participant-two',
        tracker,
    });
    const attachParticipantThreeTracking = createErrorTrackingAttacher({
        label: 'participant-three',
        tracker,
    });
    const attachMissingParticipantTracking = createErrorTrackingAttacher({
        label: 'missing-participant',
        tracker,
    });

    page = attachCreatorTracking(page);

    const createdPollResult = await createPoll({
        attachPage: attachCreatorTracking,
        page,
        pollName: createPollName('Repeated ceremony restart', namespace),
    });
    page = attachCreatorTracking(createdPollResult.page);
    const createdPoll = createdPollResult.createdPoll;
    createdPolls.push(createdPoll);

    const participantOne = await openProjectParticipant(browser, testInfo);
    const participantTwo = await openProjectParticipant(browser, testInfo);
    const participantThree = await openProjectParticipant(browser, testInfo);
    const missingParticipant = await openProjectParticipant(browser, testInfo);

    participantOne.page = attachParticipantOneTracking(participantOne.page);
    participantTwo.page = attachParticipantTwoTracking(participantTwo.page);
    participantThree.page = attachParticipantThreeTracking(
        participantThree.page,
    );
    missingParticipant.page = attachMissingParticipantTracking(
        missingParticipant.page,
    );

    try {
        page = attachCreatorTracking(
            await submitVote({
                page,
                scores: [9, 4],
                voterName: creatorName,
            }),
        );
        participantOne.page = attachParticipantOneTracking(
            await submitVote({
                attachPage: attachParticipantOneTracking,
                page: participantOne.page,
                pollUrl: createdPoll.pollUrl,
                scores: [6, 8],
                voterName: participantOneName,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await submitVote({
                attachPage: attachParticipantTwoTracking,
                page: participantTwo.page,
                pollUrl: createdPoll.pollUrl,
                scores: [7, 5],
                voterName: participantTwoName,
            }),
        );
        participantThree.page = attachParticipantThreeTracking(
            await submitVote({
                attachPage: attachParticipantThreeTracking,
                page: participantThree.page,
                pollUrl: createdPoll.pollUrl,
                scores: [8, 9],
                voterName: participantThreeName,
            }),
        );
        missingParticipant.page = attachMissingParticipantTracking(
            await submitVote({
                attachPage: attachMissingParticipantTracking,
                page: missingParticipant.page,
                pollUrl: createdPoll.pollUrl,
                scores: [10, 3],
                voterName: missingParticipantName,
            }),
        );

        await closeParticipant(missingParticipant);
        page = attachCreatorTracking(await closeVoting(page));
        [
            participantOne.page,
            participantTwo.page,
            participantThree.page,
        ] = await bringPollPagesToFront({
            attachPages: [
                attachParticipantOneTracking,
                attachParticipantTwoTracking,
                attachParticipantThreeTracking,
            ],
            pages: [
                participantOne.page,
                participantTwo.page,
                participantThree.page,
            ],
        });
        page = attachCreatorTracking(await waitForBlockingVoters({
            page,
            voterNames: [missingParticipantName],
        }));

        page = attachCreatorTracking(
            await restartCeremonyWithoutBlockingVoters(page),
        );
        [
            participantOne.page,
            participantTwo.page,
            participantThree.page,
        ] = await bringPollPagesToFront({
            attachPages: [
                attachParticipantOneTracking,
                attachParticipantTwoTracking,
                attachParticipantThreeTracking,
            ],
            pages: [
                participantOne.page,
                participantTwo.page,
                participantThree.page,
            ],
        });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '4/4',
        }));
        await closeParticipant(participantThree);
        [participantOne.page, participantTwo.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantOneTracking,
                    attachParticipantTwoTracking,
                ],
                pages: [participantOne.page, participantTwo.page],
            });
        page = attachCreatorTracking(await waitForBlockingVoters({
            page,
            voterNames: [participantThreeName],
        }));

        page = attachCreatorTracking(
            await restartCeremonyWithoutBlockingVoters(page),
        );
        [participantOne.page, participantTwo.page] =
            await bringPollPagesToFront({
                attachPages: [
                    attachParticipantOneTracking,
                    attachParticipantTwoTracking,
                ],
                pages: [participantOne.page, participantTwo.page],
            });
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Board registrations',
            page,
            value: '3/3',
        }));

        page = attachCreatorTracking(
            await waitForVerifiedResults({ expectedResults, page }),
        );
        participantOne.page = attachParticipantOneTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantOne.page,
            }),
        );
        participantTwo.page = attachParticipantTwoTracking(
            await waitForVerifiedResults({
                expectedResults,
                page: participantTwo.page,
            }),
        );
        page = attachCreatorTracking(await waitForCeremonyMetric({
            label: 'Ceremony restarts',
            page,
            value: '2',
        }));

        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participantOne);
        await closeParticipant(participantTwo);
        await closeParticipant(participantThree);
        await closeParticipant(missingParticipant);
        await deletePolls(request, createdPolls);
    }
});
