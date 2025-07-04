import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll, registerVoter } from '../testUtils';

import { ClosePollResponse } from './close';
import { PollResponse } from './fetch';

describe('POST /polls/:pollId/close', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should close the poll successfully', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(200);
        expect(
            (JSON.parse(closeResponse.body) as ClosePollResponse).message,
        ).toBe('Poll closed successfully');

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        expect((JSON.parse(getResponse.body) as PollResponse).isOpen).toBe(
            false,
        );

        await deletePoll(fastify, pollId, creatorToken);
    });
    test('should not close the poll with only one registered voter', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        await registerVoter(fastify, pollId, 'SingleVoter');

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(closeResponse.body) as ClosePollResponse).message,
        ).toBe('Not enough voters to close the poll.');

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should not close the poll with zero registered voters', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(closeResponse.body) as ClosePollResponse).message,
        ).toBe('Not enough voters to close the poll.');

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should not close the poll with incorrect creatorToken', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const wrongCreatorToken = 'wrong-token';

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken: wrongCreatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(404);
        expect(
            (JSON.parse(closeResponse.body) as ClosePollResponse).message,
        ).toBe('Poll not found or unauthorized access.');

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should return an error for closing a non-existing poll', async () => {
        const nonExistingPollId = '48a16d54-0000-0000-0000-67083a00e107';
        const creatorToken = 'some-creator-token';

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${nonExistingPollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(404);
        expect(
            (JSON.parse(closeResponse.body) as ClosePollResponse).message,
        ).toBe('Poll not found or unauthorized access.');
    });
});
