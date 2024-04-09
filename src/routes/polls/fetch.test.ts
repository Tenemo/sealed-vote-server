import { buildServer } from '../../buildServer';
import type { FastifyInstance } from 'fastify';
import { createPoll, deletePoll, getUniquePollName } from '../../testUtils';
import { PollResponse } from './fetch';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

describe('GET /polls/:pollId', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Retrieve poll details successfully', async () => {
        const pollName = getUniquePollName('GET poll');
        const { pollId, creatorToken } = await createPoll(fastify, pollName, [
            'Option 1',
            'Option 2',
        ]);

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollDetails = JSON.parse(response.body) as PollResponse;

        expect(pollDetails).toHaveProperty('pollName');
        expect(pollDetails.pollName).toEqual(pollName);
        expect(pollDetails.choices).toEqual(
            expect.arrayContaining(['Option 1', 'Option 2']),
        );
        expect(pollDetails.voters).toEqual([]);
        expect(pollDetails.isOpen).toBe(true);
        expect(pollDetails.publicKeyShares).toEqual([]);
        expect(pollDetails.commonPublicKey).toBeNull();
        expect(pollDetails.encryptedVotes).toEqual([]);
        expect(pollDetails.encryptedTallies).toEqual([]);
        expect(pollDetails.decryptionShares).toEqual([]);
        expect(pollDetails.results).toEqual([]);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
    test('Return 400 for non-uuid poll ID', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/polls/non-uuid-poll-id',
        });

        expect(response.statusCode).toBe(400);
    });
    test('Return 404 for non-existing poll', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/48a16d54-1a44-4738-b95e-67083a00e107`,
        });

        expect(response.statusCode).toBe(404);
    });
});
