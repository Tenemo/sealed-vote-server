import { expect, test } from '@playwright/test';

import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import {
    createPoll,
    deletePolls,
    type CreatedPoll,
} from './support/pollFlow';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/monitoring';
import { createTestNamespace, createVoterName } from './support/testData';

test('keeps duplicate-title polls on distinct slug URLs', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const tracker = createUnexpectedErrorTracker();
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const pollTitle = `Duplicate title vote ${namespace}`.slice(0, 64);

    attachErrorTracking(page, 'page-1', tracker);

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

    await page.goto(firstPoll.pollUrl);
    await page
        .getByLabel('Voter name')
        .fill(createVoterName('alice', namespace));
    await page.getByRole('button', { exact: true, name: 'Vote' }).click();
    await expect(page.getByText(/Voters in this poll: .*alice/i)).toBeVisible();

    const participant = await openProjectParticipant(browser, testInfo);
    attachErrorTracking(participant.page, 'page-2', tracker);

    try {
        await participant.page.goto(secondPoll.pollUrl);
        await participant.page
            .getByLabel('Voter name')
            .fill(createVoterName('bob', namespace));
        await participant.page
            .getByRole('button', { exact: true, name: 'Vote' })
            .click();

        await expect(
            participant.page.getByText(/Voters in this poll: .*bob/i),
        ).toBeVisible();
        await expect(page.getByText(/Voters in this poll: .*alice/i)).toBeVisible();
        await expect(page.getByText(/Voters in this poll: .*bob/i)).toHaveCount(0);
        await expect(
            participant.page.getByText(/Voters in this poll: .*alice/i),
        ).toHaveCount(0);
        expectNoUnexpectedErrors(tracker);
    } finally {
        await closeParticipant(participant);
        await deletePolls(request, createdPolls);
    }
});
