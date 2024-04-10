import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll } from '../testUtils';

describe('DELETE /polls/:pollId', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should delete a poll successfully', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBeTruthy();
        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        expect(getResponse.statusCode).toBe(404);
    });

    test('Should not delete a poll with incorrect creatorToken', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const wrongCreatorToken = 'wrong-token';
        const invalidDeleteResult = await deletePoll(
            fastify,
            pollId,
            wrongCreatorToken,
        );
        expect(invalidDeleteResult.success).toBeFalsy();
        expect(invalidDeleteResult.message).toBe(
            'Poll not found or unauthorized access.',
        );
        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
