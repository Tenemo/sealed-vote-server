import { ERROR_MESSAGES } from '@sealed-vote/contracts';
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
        const voter1 = await registerVoter(fastify, pollId, 'Voter1');
        const voter2 = await registerVoter(fastify, pollId, 'Voter2');
        expect(voter1.success).toBe(true);
        expect(voter2.success).toBe(true);
        if (!voter1.success || !voter2.success) {
            throw new Error('Failed to register voters.');
        }

        // Close the poll before submitting the public key share
        await closePoll(fastify, pollId, creatorToken);

        const { publicKey } = generateKeys(1, 2);
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: publicKey.toString(),
                voterToken: voter1.voterToken,
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
                voterToken: 'invalid-token',
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
                voterToken: 'invalid-token',
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
        const alice = await registerVoter(fastify, pollId, 'Alice');
        const bob = await registerVoter(fastify, pollId, 'Bob');
        expect(alice.success).toBe(true);
        expect(bob.success).toBe(true);
        if (!alice.success || !bob.success) {
            throw new Error('Failed to register voters.');
        }

        // Close the poll before submitting public key shares
        await closePoll(fastify, pollId, creatorToken);

        const voter1Keys = generateKeys(1, 2);
        const voter2Keys = generateKeys(2, 2);

        await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: voter1Keys.publicKey.toString(),
                voterToken: alice.voterToken,
            },
        });

        await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: voter2Keys.publicKey.toString(),
                voterToken: bob.voterToken,
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

    test('replays a public key share idempotently after the phase has advanced', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const alice = await registerVoter(fastify, pollId, 'Alice');
        const bob = await registerVoter(fastify, pollId, 'Bob');
        expect(alice.success).toBe(true);
        expect(bob.success).toBe(true);
        if (!alice.success || !bob.success) {
            throw new Error('Failed to register voters.');
        }

        await closePoll(fastify, pollId, creatorToken);

        const aliceKeys = generateKeys(1, 2);
        const bobKeys = generateKeys(2, 2);
        const aliceShare = aliceKeys.publicKey.toString();

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: aliceShare,
                voterToken: alice.voterToken,
            },
        });
        const bobResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: bobKeys.publicKey.toString(),
                voterToken: bob.voterToken,
            },
        });
        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: aliceShare,
                voterToken: alice.voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(bobResponse.statusCode).toBe(201);
        expect(replayResponse.statusCode).toBe(201);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('rejects replaying a different public key share for the same voter', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const alice = await registerVoter(fastify, pollId, 'Alice');
        const bob = await registerVoter(fastify, pollId, 'Bob');
        expect(alice.success).toBe(true);
        expect(bob.success).toBe(true);
        if (!alice.success || !bob.success) {
            throw new Error('Failed to register voters.');
        }

        await closePoll(fastify, pollId, creatorToken);

        const aliceShare = generateKeys(1, 2).publicKey.toString();
        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: aliceShare,
                voterToken: alice.voterToken,
            },
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/public-key-share`,
            payload: {
                publicKeyShare: generateKeys(1, 2).publicKey.toString(),
                voterToken: alice.voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(conflictingResponse.statusCode).toBe(409);
        expect(
            (JSON.parse(conflictingResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.publicKeyConflict);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
