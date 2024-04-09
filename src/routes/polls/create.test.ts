import { FastifyInstance } from 'fastify';
import { buildServer } from '../../buildServer';
import { createPoll, deletePoll, getUniquePollName } from '../../testUtils';
import { CreatePollResponse } from './create';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

describe('POST /polls/create', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Should create a new poll successfully and then delete it', async () => {
        const pollName = getUniquePollName('Create poll');
        const { pollId, creatorToken } = await createPoll(fastify, pollName, [
            'Dog',
            'Cat',
        ]);

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(getResponse.statusCode).toBe(200);
        const pollDetails = JSON.parse(getResponse.body) as CreatePollResponse;
        expect(pollDetails.pollName).toContain(pollName);
        expect(pollDetails.choices).toEqual(['Dog', 'Cat']);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Should return an error for insufficient choices', async () => {
        const pollName = getUniquePollName('Create poll');
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog'],
                pollName,
            },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe('Not enough choices.');
    });

    test('Should handle duplicate poll names correctly and clean up', async () => {
        const pollName = getUniquePollName('Create poll');
        const { pollId, creatorToken } = await createPoll(fastify, pollName, [
            'Coffee',
            'Tea',
        ]);

        const duplicateResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Coffee', 'Tea'],
                pollName,
            },
        });

        expect(duplicateResponse.statusCode).toBe(400);
        const duplicateResponseBody = JSON.parse(duplicateResponse.body) as {
            message: string;
        };
        expect(duplicateResponseBody.message).toBe(
            'Vote with that name already exists.',
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
