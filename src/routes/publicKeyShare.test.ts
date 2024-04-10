import { FastifyInstance } from 'fastify';
import { generateKeys } from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll, registerVoter, closePoll } from '../testUtils';

import { PollResponse } from './fetch';
import { PublicKeyShareResponse } from './publicKeyShare';

describe('POST /polls/:pollId/public-key-share', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should submit a public key share successfully to a closed poll', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');

        // Close the poll before submitting the public key share
        await closePoll(fastify, pollId, creatorToken);

        const { publicKey } = generateKeys(1, 1);
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: publicKey.toString(),
            },
        });

        expect(response.statusCode).toBe(201);
        const responseBody = JSON.parse(
            response.body,
        ) as PublicKeyShareResponse;
        expect(responseBody.message).toBe(
            'Public key share submitted successfully',
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('should return 400 for invalid poll ID after poll closure', async () => {
        const invalidPollId = 'invalid-poll-id';
        const { publicKey } = generateKeys(1, 1);

        // Attempting to submit a public key share to an invalid poll ID
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${invalidPollId}/public-key-share`,
            payload: {
                publicKeyShare: publicKey.toString(),
            },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe('Invalid poll ID');
    });

    test('should return 404 for non-existent poll after attempting closure', async () => {
        const nonExistentPollId = '00000000-0000-0000-0000-000000000000';
        const { publicKey } = generateKeys(1, 1);

        // Attempting to submit a public key share to a non-existent poll
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${nonExistentPollId}/public-key-share`,
            payload: {
                publicKeyShare: publicKey.toString(),
            },
        });

        expect(response.statusCode).toBe(404);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe(
            `Poll with ID ${nonExistentPollId} does not exist.`,
        );
    });

    test('should combine public keys when all voters have submitted in a closed poll, and verify combined public key', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Alice');
        await registerVoter(fastify, pollId, 'Bob');

        // Close the poll before submitting public key shares
        await closePoll(fastify, pollId, creatorToken);

        const voter1Keys = generateKeys(1, 2);
        const voter2Keys = generateKeys(2, 2);

        await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: voter1Keys.publicKey.toString(),
            },
        });

        await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: voter2Keys.publicKey.toString(),
            },
        });

        // Fetch the poll to check for the combined public key
        const getPollResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(getPollResponse.statusCode).toBe(200);
        const getPollResponseBody = JSON.parse(
            getPollResponse.body,
        ) as PollResponse;
        expect(getPollResponseBody.commonPublicKey).not.toBeNull();
        expect(getPollResponseBody.commonPublicKey).toBeDefined();

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
