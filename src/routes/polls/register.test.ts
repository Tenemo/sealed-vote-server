import { FastifyInstance } from 'fastify';
import { buildServer } from '../../buildServer';
import {
    createPoll,
    deletePoll,
    closePoll,
    registerVoter,
    getUniquePollName,
} from '../../testUtils';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

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
        expect(registrationResult.message).toBe(
            'Voter registered successfully',
        );

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

        const secondRegistrationResult = await registerVoter(
            fastify,
            pollId,
            voterName,
        );
        expect(secondRegistrationResult.success).toBeFalsy();
        expect(secondRegistrationResult.message).toBe(
            `Voter name "${voterName}" has already been taken for this vote`,
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Cannot register a voter for a closed poll', async () => {
        const { pollId, creatorToken } = await createPoll(
            fastify,
            getUniquePollName('RegisteringClosedPoll'),
        );
        await closePoll(fastify, pollId, creatorToken);

        const voterName = 'New Voter';
        const registrationResult = await registerVoter(
            fastify,
            pollId,
            voterName,
        );

        expect(registrationResult.success).toBeFalsy();
        expect(registrationResult.message).toContain('Poll is closed');

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
