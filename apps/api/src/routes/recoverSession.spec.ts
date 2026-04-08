import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    TestPollBuilder,
    createPoll,
    deletePoll,
    registerVoter,
} from '../testUtils';

describe('POST /polls/:pollId/recover-session', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('returns creator recovery state for a closed poll', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Alice');
        await registerVoter(fastify, pollId, 'Bob');

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });
        expect(closeResponse.statusCode).toBe(200);

        const recoveryResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/recover-session`,
            payload: {
                creatorToken,
            },
        });

        expect(recoveryResponse.statusCode).toBe(200);
        expect(JSON.parse(recoveryResponse.body)).toMatchObject({
            role: 'creator',
            pollId,
            phase: 'key-generation',
            isOpen: false,
            voterIndex: null,
            voterName: null,
            hasSubmittedPublicKeyShare: false,
            hasSubmittedVote: false,
            hasSubmittedDecryptionShares: false,
            resultsAvailable: false,
        });

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('returns voter recovery state with submission progress', async () => {
        const builder = new TestPollBuilder(fastify).withVoters([
            'Alice',
            'Bob',
        ]);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        const [alice] = context.voters;

        const recoveryResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/recover-session`,
            payload: {
                voterToken: alice.voterToken,
            },
        });

        expect(recoveryResponse.statusCode).toBe(200);
        expect(JSON.parse(recoveryResponse.body)).toMatchObject({
            role: 'voter',
            pollId: context.pollId,
            pollSlug: context.pollSlug,
            phase: 'decryption',
            isOpen: false,
            voterIndex: alice.voterIndex,
            voterName: alice.voterName,
            hasSubmittedPublicKeyShare: true,
            hasSubmittedVote: true,
            hasSubmittedDecryptionShares: false,
            resultsAvailable: false,
        });

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('requires exactly one recovery token', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const missingTokenResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/recover-session`,
            payload: {},
        });
        const bothTokensResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/recover-session`,
            payload: {
                creatorToken,
                voterToken: 'abc',
            },
        });

        expect(missingTokenResponse.statusCode).toBe(400);
        expect(bothTokensResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(missingTokenResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.recoverSessionTokenRequired);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
