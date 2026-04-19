import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { gotoInteractablePage } from './support/navigation.mts';
import {
    createPoll,
    deletePolls,
    expectVotersHidden,
    expectVotersVisible,
    registerParticipant,
    type CreatedPoll,
} from './support/poll-flow';
import {
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/error-tracking';
import { createTestNamespace, createVoterName } from './support/test-data';

test('keeps duplicate poll names on distinct slug URLs with isolated rosters', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker({ testInfo });
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollName = `Duplicate name vote ${namespace}`.slice(0, 64);
    const firstPollVoterName = createVoterName('alice', namespace);
    const secondPollVoterName = createVoterName('bob', namespace);
    const attachFirstPollTracking = createErrorTrackingAttacher({
        label: 'first-poll',
        tracker,
    });
    const attachSecondPollTracking = createErrorTrackingAttacher({
        label: 'second-poll',
        tracker,
    });

    const createPollWithName = async (): Promise<CreatedPoll> => {
        const createdPollResult = await createPoll({
            page,
            pollName,
        });
        page = createdPollResult.page;
        const createdPoll = createdPollResult.createdPoll;
        createdPolls.push(createdPoll);

        return createdPoll;
    };

    const firstPoll = await createPollWithName();
    const secondPoll = await createPollWithName();

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
    await expectVotersVisible(page, [firstPollVoterName]);

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

        await expectVotersVisible(participant.page, [
            secondPollVoterName,
        ]);
        await expectVotersVisible(page, [firstPollVoterName]);
        await expectVotersHidden(page, [secondPollVoterName]);
        await expectVotersHidden(participant.page, [firstPollVoterName]);
        await expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
