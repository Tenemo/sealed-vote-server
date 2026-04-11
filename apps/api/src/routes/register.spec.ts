import { randomBytes } from 'node:crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
} from 'threshold-elgamal';

import { buildServer } from '../buildServer';
import { publicKeyShares } from '../db/schema';
import {
    createPoll,
    deletePoll,
    closePoll,
    registerVoter,
    getUniquePollName,
} from '../testUtils';

const generateToken = (): string => randomBytes(32).toString('hex');

const createRegistrationPayload = async ({
    voterName,
    voterToken,
}: {
    voterName: string;
    voterToken: string;
}): Promise<{
    authPublicKey: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
    voterName: string;
    voterToken: string;
}> => {
    const authKeyPair = await generateAuthKeyPair();
    const transportKeyPair = await generateTransportKeyPair();

    if (transportKeyPair.suite !== 'X25519') {
        throw new Error(
            `Expected an X25519 transport key pair, received ${transportKeyPair.suite}.`,
        );
    }

    return {
        authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
        transportPublicKey: await exportTransportPublicKey(
            transportKeyPair.publicKey,
        ),
        transportSuite: 'X25519',
        voterName,
        voterToken,
    };
};

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

    test('rejects an invalid voter token format', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: await createRegistrationPayload({
                voterName: 'Alice',
                voterToken: 'short-token',
            }),
        });

        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('rejects voter names that become blank after trimming', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);

        const payload = await createRegistrationPayload({
            voterName: '   ',
            voterToken: generateToken(),
        });
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            'Voter name is required.',
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
        await registerVoter(fastify, pollId, 'Voter3');
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

    test('rejects registrations after the participant cap is reached', async () => {
        const { pollId, creatorToken } = await createPoll(
            fastify,
            getUniquePollName('RegisteringMaxParticipants'),
        );

        for (let index = 1; index <= 51; index += 1) {
            const registrationResult = await registerVoter(
                fastify,
                pollId,
                `Voter ${index}`,
            );
            expect(registrationResult.success).toBe(true);
            if (!registrationResult.success) {
                throw new Error(registrationResult.message);
            }
        }

        const payload = await createRegistrationPayload({
            voterName: 'Voter 52',
            voterToken: generateToken(),
        });
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            ERROR_MESSAGES.maxParticipantsReached,
        );

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('repairs a malformed stored device record for an idempotent replay', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterToken = generateToken();
        const payload = await createRegistrationPayload({
            voterName: 'Alice',
            voterToken,
        });

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });

        expect(firstResponse.statusCode).toBe(201);

        await fastify.db
            .update(publicKeyShares)
            .set({
                publicKeyShare: '{"transportSuite":"X25519"}',
            })
            .where(eq(publicKeyShares.pollId, pollId));

        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload,
        });

        expect(replayResponse.statusCode).toBe(201);

        const secondVoter = await registerVoter(fastify, pollId, 'Bob');
        const thirdVoter = await registerVoter(fastify, pollId, 'Carol');
        expect(secondVoter.success).toBe(true);
        expect(thirdVoter.success).toBe(true);

        const closeResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/close`,
            payload: {
                creatorToken,
            },
        });

        expect(closeResponse.statusCode).toBe(200);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('replays voter registration idempotently for the same token and name', async () => {
        const { pollId, creatorToken } = await createPoll(fastify);
        const voterToken = generateToken();
        const payload = await createRegistrationPayload({
            voterName: 'Alice',
            voterToken,
        });

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
        const firstPayload = await createRegistrationPayload({
            voterName: 'Alice',
            voterToken,
        });
        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: firstPayload,
        });
        expect(firstResponse.statusCode).toBe(201);

        await closePoll(fastify, pollId, creatorToken);

        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: firstPayload,
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

        const firstPayload = await createRegistrationPayload({
            voterName: 'Alice',
            voterToken,
        });
        const conflictingPayload = {
            ...firstPayload,
            voterName: 'Alicia',
        };
        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: firstPayload,
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/register`,
            payload: conflictingPayload,
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
