import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { publicKeyShares } from '../db/schema';
import { createPoll, deletePoll, registerVoter } from '../testUtils';

import { PollResponse } from './fetch';

type CloseVotingResponse = {
    message: string;
};

describe('POST /polls/:pollId/close', () => {
    let fastify: FastifyInstance;
    const wrongButValidCreatorToken = 'a'.repeat(64);

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('closes voting successfully once three submitted voters exist', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(200);
        expect(
            (JSON.parse(closeResponse.body) as CloseVotingResponse).message,
        ).toBe('Voting closed successfully.');

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const poll = JSON.parse(getResponse.body) as PollResponse;

        expect(poll.isOpen).toBe(false);
        expect(poll.phase).toBe('securing');
        expect(poll.thresholds.reconstructionThreshold).toBe(2);
        expect(poll.thresholds.minimumPublishedVoterCount).toBe(2);
        expect(poll.ceremony.activeParticipantCount).toBe(3);
        expect(poll.ceremony.restartCount).toBe(0);
        expect(poll.ceremony.blockingParticipantIndices).toEqual([1, 2, 3]);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('rejects close when fewer than three submitted voters exist', async () => {
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
            (JSON.parse(closeResponse.body) as CloseVotingResponse).message,
        ).toBe(ERROR_MESSAGES.notEnoughParticipantsToClose);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('rejects close with an incorrect creator token', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken: wrongButValidCreatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(403);
        expect(
            (JSON.parse(closeResponse.body) as CloseVotingResponse).message,
        ).toBe(ERROR_MESSAGES.invalidCreatorToken);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('replays close idempotently after voting is already closed', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });
        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(firstResponse.statusCode).toBe(200);
        expect(replayResponse.statusCode).toBe(200);
        expect(
            (JSON.parse(replayResponse.body) as CloseVotingResponse).message,
        ).toBe('Voting closed successfully.');

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('rejects close when a stored participant device record is malformed', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        await fastify.db
            .update(publicKeyShares)
            .set({
                publicKeyShare: '{"transportSuite":"X25519"}',
            })
            .where(eq(publicKeyShares.pollId, pollId));

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(closeResponse.body) as CloseVotingResponse).message,
        ).toBe(ERROR_MESSAGES.participantDeviceKeysRequired);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('returns 404 when closing a non-existing poll', async () => {
        const nonExistingPollId = '48a16d54-0000-0000-0000-67083a00e107';

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${nonExistingPollId}/close`,
            payload: {
                creatorToken: wrongButValidCreatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(404);
        expect(
            (JSON.parse(closeResponse.body) as CloseVotingResponse).message,
        ).toBe(`Poll with ID ${nonExistingPollId} does not exist.`);
    });
});
