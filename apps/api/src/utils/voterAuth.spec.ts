import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import {
    createPoll,
    deletePoll,
    getUniquePollName,
    registerVoter,
} from '@sealed-vote/testkit';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';

import {
    authenticateVoter,
    authenticateVoterReadOnly,
    hashSecureToken,
} from './voterAuth';

describe('voter auth helpers', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('hashes tokens deterministically', () => {
        const token = 'A'.repeat(64);

        expect(hashSecureToken(token)).toBe(hashSecureToken(token));
        expect(hashSecureToken(token)).not.toBe(token);
    });

    test('authenticates a registered voter in both locked and read-only flows', async () => {
        const { creatorToken, pollId } = await createPoll(
            fastify,
            getUniquePollName('Authenticate voter helper'),
        );
        const registration = await registerVoter(fastify, pollId, 'Alice');

        expect(registration.success).toBe(true);
        if (!registration.success) {
            throw new Error(registration.message);
        }

        const authenticatedVoter = await fastify.db.transaction(
            async (tx) =>
                await authenticateVoter(tx, pollId, registration.voterToken),
        );
        const authenticatedVoterReadOnly = await authenticateVoterReadOnly(
            fastify.db,
            pollId,
            registration.voterToken,
        );

        expect(authenticatedVoter).toMatchObject({
            voterIndex: registration.voterIndex,
            voterName: 'Alice',
        });
        expect(authenticatedVoterReadOnly).toEqual(authenticatedVoter);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('throws the invalid voter token error when authentication fails', async () => {
        const { creatorToken, pollId } = await createPoll(
            fastify,
            getUniquePollName('Reject invalid voter token'),
        );

        await expect(
            fastify.db.transaction(
                async (tx) =>
                    await authenticateVoter(tx, pollId, 'b'.repeat(64)),
            ),
        ).rejects.toMatchObject({
            message: ERROR_MESSAGES.invalidVoterToken,
            statusCode: 403,
        });

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
