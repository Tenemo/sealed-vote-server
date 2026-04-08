import { randomBytes } from 'node:crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    createPoll,
    deletePoll,
    closePoll,
    registerVoter,
    getUniquePollName,
} from '../testUtils';

const generateToken = (): string => randomBytes(32).toString('hex');

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

        const registrationResult = await registerVoter(
            fastify,
            pollId,
            voterName,
        );

        expect(registrationResult.success).toBe(true);
        if (!registrationResult.success) {
            throw new Error(registrationResult.message);
        }
        expect(registrationResult.message).toBe(
            'Voter registered successfully',
        );
        expect(registrationResult.voterToken).toHaveLength(64);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Handle duplicate voter names', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterName = 'Jane Doe';

        const firstRegistrationResult = await registerVoter(
            fastify,
            pollId,
            voterName,
        );
        expect(firstRegistrationResult.success).toBe(true);
        if (!firstRegistrationResult.success) {
            throw new Error(firstRegistrationResult.message);
        }

        const secondRegistrationResult = await registerVoter(
            fastify,
            pollId,
            voterName,
        );
        expect(secondRegistrationResult.success).toBeFalsy();
        expect(secondRegistrationResult.message).toBe(
            'Voter name is already taken for this vote.',
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Cannot register a voter for a closed poll', async () => {
        const { pollId, creatorToken } = await createPoll(
            fastify,
            getUniquePollName('RegisteringClosedPoll'),
        );
        await registerVoter(fastify, pollId, 'Voter1');
        await registerVoter(fastify, pollId, 'Voter2');
        await closePoll(fastify, pollId, creatorToken);

        const registrationResult = await registerVoter(
            fastify,
            pollId,
            'New Voter',
        );

        expect(registrationResult.success).toBeFalsy();
        expect(registrationResult.message).toContain('Poll is closed');

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('replays voter registration idempotently for the same token and name', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterToken = generateToken();
        const payload = {
            voterName: 'Alice',
            voterToken,
        };

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });
        const secondResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(secondResponse.statusCode).toBe(201);

        const firstBody = JSON.parse(firstResponse.body) as {
            voterIndex: number;
            voterName: string;
            voterToken: string;
        };
        const secondBody = JSON.parse(secondResponse.body) as typeof firstBody;

        expect(secondBody.voterIndex).toBe(firstBody.voterIndex);
        expect(secondBody.voterName).toBe(firstBody.voterName);
        expect(secondBody.voterToken).toBe(voterToken);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('replays an existing registration idempotently after the poll closes', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const secondVoter = await registerVoter(fastify, pollId, 'Bob');
        expect(secondVoter.success).toBe(true);
        if (!secondVoter.success) {
            throw new Error(
                'Expected a second voter to register successfully.',
            );
        }

        const voterToken = generateToken();
        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: {
                voterName: 'Alice',
                voterToken,
            },
        });
        expect(firstResponse.statusCode).toBe(201);

        await closePoll(fastify, pollId, creatorToken);

        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: {
                voterName: 'Alice',
                voterToken,
            },
        });

        expect(replayResponse.statusCode).toBe(201);
        expect(
            (JSON.parse(replayResponse.body) as { voterName: string })
                .voterName,
        ).toBe('Alice');

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('rejects reusing a voter token with a different name', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterToken = generateToken();

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: {
                voterName: 'Alice',
                voterToken,
            },
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: {
                voterName: 'Alicia',
                voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(conflictingResponse.statusCode).toBe(409);
        expect(
            (JSON.parse(conflictingResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.voterTokenConflict);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
