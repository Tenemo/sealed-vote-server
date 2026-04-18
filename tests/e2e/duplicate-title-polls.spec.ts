import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    expectParticipantsHidden,
    expectParticipantsVisible,
    registerParticipant,
    type CreatedPoll,
} from './support/poll-flow';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import { createTestNamespace, createVoterName } from './support/test-data';

test('keeps duplicate-title polls on distinct slug URLs with isolated rosters', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollTitle = `Duplicate title vote ${namespace}`.slice(0, 64);
    const firstPollVoterName = createVoterName('alice', namespace);
    const secondPollVoterName = createVoterName('bob', namespace);
    const attachFirstPollTracking = createErrorTrackingAttacher({
        label: 'first-poll',
        options: {
            allowedConsoleErrors: [/^Error$/],
        },
        tracker,
    });
    const attachSecondPollTracking = createErrorTrackingAttacher({
        label: 'second-poll',
        options: {
            allowedConsoleErrors: [/^Error$/],
        },
        tracker,
    });

    const createPollWithTitle = async (): Promise<CreatedPoll> => {
        const createdPollResult = await createPoll({
            page,
            pollName: pollTitle,
        });
        page = createdPollResult.page;
        const createdPoll = createdPollResult.createdPoll;
        createdPolls.push(createdPoll);

        return createdPoll;
    };

    const firstPoll = await createPollWithTitle();
    const secondPoll = await createPollWithTitle();

    expect(secondPoll.pollUrl).not.toBe(firstPoll.pollUrl);

    page = attachFirstPollTracking(page);
    page = attachFirstPollTracking(
        await gotoInteractablePage(page, firstPoll.pollUrl),
    );
    page = attachFirstPollTracking(
        await registerParticipant({
            page,
            voterName: firstPollVoterName,
        }),
    );
    await expectParticipantsVisible(page, [firstPollVoterName]);

    const participant = await openProjectParticipant(browser, testInfo);
    participant.page = attachSecondPollTracking(participant.page);

    try {
        participant.page = attachSecondPollTracking(
            await registerParticipant({
                attachPage: attachSecondPollTracking,
                page: participant.page,
                pollUrl: secondPoll.pollUrl,
                voterName: secondPollVoterName,
            }),
        );

        await expectParticipantsVisible(participant.page, [
            secondPollVoterName,
        ]);
        await expectParticipantsVisible(page, [firstPollVoterName]);
        await expectParticipantsHidden(page, [secondPollVoterName]);
        await expectParticipantsHidden(participant.page, [firstPollVoterName]);
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
