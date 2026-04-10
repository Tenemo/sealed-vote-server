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
} from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/errorTracking';
import { createTestNamespace, createVoterName } from './support/testData';

test('keeps duplicate-title polls on distinct slug URLs with isolated rosters', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollTitle = `Duplicate title vote ${namespace}`.slice(0, 64);
    const firstPollVoterName = createVoterName('alice', namespace);
    const secondPollVoterName = createVoterName('bob', namespace);

    attachErrorTracking(page, 'first-poll', tracker);

    const createPollWithTitle = async (): Promise<CreatedPoll> => {
        const createdPoll = await createPoll({
            page,
            pollName: pollTitle,
        });
        createdPolls.push(createdPoll);

        return createdPoll;
    };

    const firstPoll = await createPollWithTitle();
    const secondPoll = await createPollWithTitle();

    expect(secondPoll.pollUrl).not.toBe(firstPoll.pollUrl);

    await gotoInteractablePage(page, firstPoll.pollUrl);
    await registerParticipant({
        page,
        voterName: firstPollVoterName,
    });
    await expectParticipantsVisible(page, [firstPollVoterName]);

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'second-poll', tracker);

    try {
        await registerParticipant({
            page: participant.page,
            pollUrl: secondPoll.pollUrl,
            voterName: secondPollVoterName,
        });

        await expectParticipantsVisible(participant.page, [
            secondPollVoterName,
        ]);
        await expectParticipantsVisible(page, [firstPollVoterName]);
        await expectParticipantsHidden(page, [secondPollVoterName]);
        await expectParticipantsHidden(participant.page, [firstPollVoterName]);
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
