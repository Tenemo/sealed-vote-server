import { computeGeometricMean } from '@sealed-vote/protocol';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    deletePoll,
    fetchPoll,
    getUniquePollName,
    registerVoter,
    TestPollBuilder,
    type ScoreMatrix,
} from '../testUtils';

describe('E2E voting test', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('completes the full voting workflow and produces the expected results', async () => {
        const pollName = getUniquePollName('Which animal should we get?');
        const choices = ['Dog', 'Cat', 'Cow', 'Goat'];
        const voterNames = ['Alice', 'Bob', 'Charlie'];
        const scoreMatrix: ScoreMatrix = {
            Alice: {
                Dog: 10,
                Cat: 2,
                Cow: 3,
                Goat: 9,
            },
            Bob: {
                Dog: 5,
                Cat: 6,
                Cow: 7,
                Goat: 8,
            },
            Charlie: {
                Dog: 9,
                Cat: 10,
                Cow: 1,
                Goat: 4,
            },
        };

        const expectedTallies = choices.map((choice) =>
            voterNames.reduce(
                (product, voterName) =>
                    product * scoreMatrix[voterName][choice],
                1,
            ),
        );
        const expectedResultTallies = expectedTallies.map((value) =>
            value.toString(),
        );
        const expectedResultScores = computeGeometricMean(
            expectedResultTallies,
            voterNames.length,
        );

        const builder = new TestPollBuilder(fastify)
            .withPollName(pollName)
            .withChoices(choices)
            .withVoters(voterNames)
            .withScoreMatrix(scoreMatrix);

        await builder.create();
        let context = builder.getContext();
        expect(context.pollName).toBe(pollName);
        expect(context.choices).toEqual(choices);

        await builder.registerVoters();
        context = builder.getContext();
        expect(context.poll?.voters).toEqual(voterNames);

        await builder.close();
        context = builder.getContext();
        expect(context.poll?.isOpen).toBe(false);

        const lateRegistration = await registerVoter(
            fastify,
            context.pollId,
            'NewVoter',
        );
        expect(lateRegistration.success).toBe(false);
        expect(lateRegistration.message).toContain('Poll is closed');

        await builder.submitPublicKeyShares();
        context = builder.getContext();
        expect(context.poll?.publicKeyShareCount).toBe(voterNames.length);
        expect(context.poll?.commonPublicKey).not.toBeNull();

        await builder.submitVotes();
        context = builder.getContext();
        expect(context.poll?.encryptedVoteCount).toBe(voterNames.length);
        expect(context.poll?.encryptedTallies).toHaveLength(choices.length);

        await builder.submitDecryptionShares();
        context = builder.getContext();
        expect(context.poll?.decryptionShareCount).toBe(voterNames.length);
        expect(context.poll?.publishedDecryptionShares).toHaveLength(
            voterNames.length,
        );
        expect(context.poll?.resultTallies).toEqual(expectedResultTallies);
        expect(context.poll?.resultScores).toEqual(expectedResultScores);

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.publishedDecryptionShares).toHaveLength(
            voterNames.length,
        );
        expect(pollData.resultTallies).toEqual(expectedResultTallies);
        expect(pollData.resultScores).toEqual(expectedResultScores);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);

        const deletedPoll = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${context.pollId}`,
        });
        expect(deletedPoll.statusCode).toBe(404);
    });
});
