import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';

describe('POST /polls/:pollId/recover-session', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer(false);
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('returns 410 with a migration message for the removed endpoint', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/11111111-1111-1111-1111-111111111111/recover-session',
        });

        expect(response.statusCode).toBe(410);
        expect(JSON.parse(response.body)).toEqual({
            message:
                'The /polls/:pollId/recover-session endpoint has been removed. Use the supported local recovery flow instead.',
        });
    });
});
