import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll, getUniquePollName } from '../testUtils';

import { CreatePollResponse } from './create';
import { PollResponse } from './fetch';

describe('GET /polls/:pollRef', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Retrieve poll details successfully', async () => {
        const pollName = getUniquePollName('GET poll');
        const { pollId, pollSlug, creatorToken } = await createPoll(
            fastify,
            pollName,
            ['Option 1', 'Option 2'],
        );

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollDetails = JSON.parse(response.body) as PollResponse;

        expect(pollDetails.id).toBe(pollId);
        expect(pollDetails.slug).toBe(pollSlug);
        expect(pollDetails).toHaveProperty('pollName');
        expect(pollDetails.pollName).toEqual(pollName);
        expect(pollDetails.choices).toEqual(
            expect.arrayContaining(['Option 1', 'Option 2']),
        );
        expect(pollDetails.voters).toEqual([]);
        expect(pollDetails.isOpen).toBe(true);
        expect(pollDetails.publicKeyShareCount).toBe(0);
        expect(pollDetails.commonPublicKey).toBeNull();
        expect(pollDetails.encryptedVoteCount).toBe(0);
        expect(pollDetails.encryptedTallies).toEqual([]);
        expect(pollDetails.decryptionShareCount).toBe(0);
        expect(pollDetails.results).toEqual([]);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
    test('retrieves poll details successfully by slug', async () => {
        const pollName = getUniquePollName('GET poll by slug');
        const { pollId, pollSlug, creatorToken } = await createPoll(
            fastify,
            pollName,
            ['Option 1', 'Option 2'],
        );

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollSlug}`,
        });

        expect(response.statusCode).toBe(200);
        const pollDetails = JSON.parse(response.body) as PollResponse;
        expect(pollDetails.id).toBe(pollId);
        expect(pollDetails.slug).toBe(pollSlug);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('requires an exact slug match', async () => {
        const pollName = getUniquePollName('GET poll exact slug');
        const { pollId, pollSlug, creatorToken } = await createPoll(
            fastify,
            pollName,
            ['Option 1', 'Option 2'],
        );

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollSlug.toUpperCase()}`,
        });

        expect(response.statusCode).toBe(404);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('returns 404 for non-existing slug', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/polls/non-uuid-poll-id',
        });

        expect(response.statusCode).toBe(404);
    });

    test('returns distinct slugs for duplicate poll titles', async () => {
        const pollName = getUniquePollName('Same title');
        const firstResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Option 1', 'Option 2'],
                pollName,
            },
        });
        const secondResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Option 1', 'Option 2'],
                pollName,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(secondResponse.statusCode).toBe(201);

        const firstPoll = JSON.parse(firstResponse.body) as CreatePollResponse;
        const secondPoll = JSON.parse(
            secondResponse.body,
        ) as CreatePollResponse;
        expect(firstPoll.slug).not.toBe(secondPoll.slug);

        const firstDeleteResult = await deletePoll(
            fastify,
            firstPoll.id,
            firstPoll.creatorToken,
        );
        expect(firstDeleteResult.success).toBe(true);

        const secondDeleteResult = await deletePoll(
            fastify,
            secondPoll.id,
            secondPoll.creatorToken,
        );
        expect(secondDeleteResult.success).toBe(true);
    });
});
