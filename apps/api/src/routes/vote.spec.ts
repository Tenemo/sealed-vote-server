import { FastifyInstance } from 'fastify';
import { encrypt, serializeEncryptedMessage } from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    deletePoll,
    fetchPoll,
    getUniquePollName,
    TestPollBuilder,
} from '../testUtils';

describe('POST /polls/:pollId/vote', () => {
    let fastify: FastifyInstance;
    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should allow voters to cast their votes', async () => {
        const pollName = getUniquePollName('Vote test');
        const choices = ['Option 1', 'Option 2', 'Option 3'];

        const builder = new TestPollBuilder(fastify)
            .withPollName(pollName)
            .withChoices(choices)
            .withVoters(['Voter 1', 'Voter 2', 'Voter 3']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        if (!context.poll?.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const [voter1, voter2, voter3] = context.voters;
        const commonPublicKey = BigInt(context.poll.commonPublicKey);
        const voter1Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 1, commonPublicKey)),
        );
        const voter2Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 2, commonPublicKey)),
        );
        const voter3Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 3, commonPublicKey)),
        );

        const response1 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter1Votes, voterToken: voter1.voterToken },
        });
        expect(response1.statusCode).toBe(200);

        const response2 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter2Votes, voterToken: voter2.voterToken },
        });
        expect(response2.statusCode).toBe(200);

        const response3 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter3Votes, voterToken: voter3.voterToken },
        });
        expect(response3.statusCode).toBe(200);

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.encryptedVoteCount).toBe(3);
        expect(pollData.encryptedTallies.length).toBe(3);
        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('should return 400 for an invalid poll ID', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/invalid-poll-id/vote',
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);
    });

    test('should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/00000000-0000-0000-0000-000000000000/vote',
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(404);
    });

    test('should return 400 for voting in an open poll', async () => {
        const openPollName = getUniquePollName('Open Poll');
        const builder = new TestPollBuilder(fastify).withPollName(openPollName);

        await builder.create();
        const { creatorToken, pollId } = builder.getContext();

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
