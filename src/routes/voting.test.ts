import { FastifyInstance } from 'fastify';
import { buildServer } from '../buildServer';
import {
    createPoll,
    deletePoll,
    registerVoter,
    closePoll,
    publicKeyShare,
    getUniquePollName,
} from '../testUtils';
import { generateKeys } from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PollResponse } from './fetch';

describe('E2E voting test', () => {
    let fastify: FastifyInstance;
    let pollId: string;
    let creatorToken: string;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    const pollName = getUniquePollName('Which animal should we get?');
    const choices = ['Dog', 'Cat', 'Cow', 'Goat'];
    const threshold = 3;

    test('Should create a new poll with 4 options successfully', async () => {
        const pollData = await createPoll(fastify, pollName, choices);
        pollId = pollData.pollId;
        creatorToken = pollData.creatorToken;

        expect(pollData.pollName).toBe(pollName);
        expect(pollData.choices).toEqual(choices);
    });

    test('Should allow 3 voters to register for the poll', async () => {
        await registerVoter(fastify, pollId, 'Alice');
        await registerVoter(fastify, pollId, 'Bob');
        await registerVoter(fastify, pollId, 'Charlie');

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.voters).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('Should allow the creator to close the poll', async () => {
        await closePoll(fastify, pollId, creatorToken);

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.isOpen).toBe(false);
    });

    test('Should not allow a new voter to register after the poll is closed', async () => {
        const newVoterName = 'NewVoter';
        const registrationResult = await registerVoter(
            fastify,
            pollId,
            newVoterName,
        );

        // Expect the registration to fail since the poll is closed
        expect(registrationResult.success).toBeFalsy();
        expect(registrationResult.message).toContain('Poll is closed');

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        // Confirm that the new voter was indeed not added
        expect(response.statusCode).toBe(200);
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.voters).not.toContain(newVoterName);
    });

    test('Should allow voters to submit public key shares', async () => {
        const aliceKeys = generateKeys(1, threshold);
        const bobKeys = generateKeys(2, threshold);
        const charlieKeys = generateKeys(3, threshold);

        await publicKeyShare(fastify, pollId, aliceKeys.publicKey.toString());
        await publicKeyShare(fastify, pollId, bobKeys.publicKey.toString());
        await publicKeyShare(fastify, pollId, charlieKeys.publicKey.toString());

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.publicKeyShares.length).toBe(3);
        expect(pollData.commonPublicKey).not.toBeNull();
    });

    test('Should delete the poll after the voting process is complete', async () => {
        await deletePoll(fastify, pollId, creatorToken);

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(404);
    });
});
