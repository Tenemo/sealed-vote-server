import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { createPoll, deletePoll } from '@sealed-vote/testkit';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../build-server';

describe('DELETE /polls/:pollId', () => {
    let fastify: FastifyInstance;
    const wrongButValidCreatorToken = 'a'.repeat(64);

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

    test('should not delete a poll with incorrect creator token', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const invalidDeleteResponse = await fastify.inject({
            method: 'DELETE',
            url: `/api/polls/${pollId}`,
            payload: {
                creatorToken: wrongButValidCreatorToken,
            },
        });

        expect(invalidDeleteResponse.statusCode).toBe(403);
        expect(
            (JSON.parse(invalidDeleteResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.invalidCreatorToken);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('should reject an invalid creator token format', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const invalidDeleteResponse = await fastify.inject({
            method: 'DELETE',
            url: `/api/polls/${pollId}`,
            payload: {
                creatorToken: 'short-token',
            },
        });

        expect(invalidDeleteResponse.statusCode).toBe(400);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
