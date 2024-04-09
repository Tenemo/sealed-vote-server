import { FastifyInstance } from 'fastify';
import { buildServer } from '../../buildServer';
import { createPoll, deletePoll } from '../../testUtils';
import type { RegisterResponse } from './register';

describe('Register voter endpoint', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Register a voter successfully', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterName = 'John Doe';

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: { voterName },
        });

        expect(response.statusCode).toBe(201);
        const responseBody = JSON.parse(response.body) as RegisterResponse;
        expect(responseBody.message).toBe('Voter registered successfully');

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Handle duplicate voter names', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterName = 'Jane Doe';

        await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: { voterName },
        });

        const duplicateResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: { voterName },
        });

        expect(duplicateResponse.statusCode).toBe(409);
        const responseBody: { message: string } = JSON.parse(
            duplicateResponse.body,
        ) as RegisterResponse;
        expect(responseBody.message).toBe(
            `Voter name "${voterName}" has already been taken for this vote`,
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
