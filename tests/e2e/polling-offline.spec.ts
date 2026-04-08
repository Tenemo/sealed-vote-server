import { expect, test } from '@playwright/test';

import {
    beginVote,
    createPoll,
    deletePolls,
    expectConnectionToastHidden,
    expectConnectionToastVisible,
    expectResultsVisible,
    joinPoll,
    type CreatedPoll,
} from './support/pollFlow';
import {
    closeParticipant,
    openProjectParticipant,
} from './support/participants';
import { createPollName, createTestNamespace } from './support/testData';

test('keeps the voting flow usable across disconnects before and after the vote starts', async ({
    browser,
    page,
    request,
}, testInfo) => {
    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);
    const creatorName = `alice-${namespace}`;
    const participantName = `bob-${namespace}`;
    const pollName = createPollName('Reconnect tolerance', namespace);

    try {
        const createdPoll = await createPoll({
            page,
            pollName,
        });
        createdPolls.push(createdPoll);

        const participant = await openProjectParticipant(browser, testInfo);

        try {
            await joinPoll({
                page,
                voterName: creatorName,
            });
            await joinPoll({
                page: participant.page,
                pollUrl: createdPoll.pollUrl,
                voterName: participantName,
            });

            const beginVoteButton = page.getByRole('button', {
                name: 'Begin vote',
            });
            await expect(beginVoteButton).toBeEnabled({ timeout: 30_000 });

            await participant.context.setOffline(true);
            await expectConnectionToastVisible(participant.page);
            await expect(
                participant.page.getByText('Waiting for the vote to be started...'),
            ).toBeVisible();
            await participant.context.setOffline(false);
            await expectConnectionToastHidden(participant.page);

            await page.context().setOffline(true);
            await expectConnectionToastVisible(page);
            await expect(beginVoteButton).toBeVisible();
            await page.context().setOffline(false);
            await expectConnectionToastHidden(page);

            await beginVote(page);
            await expect(
                page.getByText(
                    /Waiting for common public key\.\.\.|Waiting for encrypted tallies\.\.\.|Waiting for all decryption shares and results\.\.\./i,
                ),
            ).toBeVisible({ timeout: 30_000 });
            await participant.context.setOffline(true);
            await expectConnectionToastVisible(participant.page);
            await expect(
                participant.page.getByRole('heading', { name: pollName }),
            ).toBeVisible();

            await participant.context.setOffline(false);
            await expectConnectionToastHidden(participant.page);

            await expectResultsVisible(page);
            await expectResultsVisible(participant.page);
            await expect(
                page.getByText(
                    `Voters in this poll: ${creatorName}, ${participantName}`,
                ),
            ).toBeVisible();
        } finally {
            await page.context().setOffline(false);
            await participant.context.setOffline(false);
            await closeParticipant(participant);
        }
    } finally {
        await page.context().setOffline(false);
        await deletePolls(request, createdPolls);
    }
});
