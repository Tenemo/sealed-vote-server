import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll, registerVoter } from '../testUtils';

import { StartVotingResponse } from './start';
import { PollResponse } from './fetch';

describe('POST /polls/:pollId/start', () => {
    let fastify: FastifyInstance;
    const wrongButValidCreatorToken = 'a'.repeat(64);

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should start voting successfully', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        const startResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken,
                thresholdPercent: 66,
            },
        });

        expect(startResponse.statusCode).toBe(200);
        expect(
            (JSON.parse(startResponse.body) as StartVotingResponse).message,
        ).toBe('Voting started successfully');

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const poll = JSON.parse(getResponse.body) as PollResponse;

        expect(poll.isOpen).toBe(false);
        expect(poll.phase).toBe('preparing');
        expect(poll.thresholds.reconstructionThreshold).toBe(2);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should not start voting with fewer than three joined participants', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'SingleVoter');

        const startResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken,
                thresholdPercent: 66,
            },
        });

        expect(startResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(startResponse.body) as StartVotingResponse).message,
        ).toBe(ERROR_MESSAGES.notEnoughParticipantsToStart);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should not start voting with incorrect creator token', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const startResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken: wrongButValidCreatorToken,
                thresholdPercent: 66,
            },
        });

        expect(startResponse.statusCode).toBe(403);
        expect(
            (JSON.parse(startResponse.body) as StartVotingResponse).message,
        ).toBe(ERROR_MESSAGES.invalidCreatorToken);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('keeps the legacy close alias compatible with creator-token-only requests', async () => {
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
            (JSON.parse(closeResponse.body) as StartVotingResponse).message,
        ).toBe('Voting started successfully');

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const poll = JSON.parse(getResponse.body) as PollResponse;

        expect(poll.isOpen).toBe(false);
        expect(poll.thresholds.reconstructionThreshold).toBe(2);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('replays start idempotently after voting is already started', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken,
                thresholdPercent: 66,
            },
        });
        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken,
                thresholdPercent: 80,
            },
        });

        expect(firstResponse.statusCode).toBe(200);
        expect(replayResponse.statusCode).toBe(200);
        expect(
            (JSON.parse(replayResponse.body) as StartVotingResponse).message,
        ).toBe('Voting started successfully');

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('allows n-of-n when the creator chooses 100 percent', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await registerVoter(fastify, pollId, 'Voter3');

        const startResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/start`,
            payload: {
                creatorToken,
                thresholdPercent: 100,
            },
        });

        expect(startResponse.statusCode).toBe(200);

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const poll = JSON.parse(getResponse.body) as PollResponse;

        expect(poll.thresholds.reconstructionThreshold).toBe(3);
        expect(poll.thresholds.minimumPublishedVoterCount).toBe(3);

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('should return an error for starting a non-existing poll', async () => {
        const nonExistingPollId = '48a16d54-0000-0000-0000-67083a00e107';

        const startResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${nonExistingPollId}/start`,
            payload: {
                creatorToken: wrongButValidCreatorToken,
                thresholdPercent: 66,
            },
        });

        expect(startResponse.statusCode).toBe(404);
        expect(
            (JSON.parse(startResponse.body) as StartVotingResponse).message,
        ).toBe(`Poll with ID ${nonExistingPollId} does not exist.`);
    });
});
