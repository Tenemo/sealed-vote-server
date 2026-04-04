import { FastifyInstance } from 'fastify';
import {
    generateKeys,
    encrypt,
    serializeEncryptedMessage,
} from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    createPoll,
    deletePoll,
    registerVoter,
    closePoll,
    publicKeyShare,
    getUniquePollName,
} from '../testUtils';

import { PollResponse } from './fetch';

describe('POST /polls/:pollId/vote', () => {
    let fastify: FastifyInstance;
    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should allow voters to cast their votes', async () => {
        const pollName = getUniquePollName('Vote test');
        const choices = ['Option 1', 'Option 2', 'Option 3'];

        const { pollId, creatorToken } = await createPoll(
            fastify,
            pollName,
            choices,
        );

        const voter1 = await registerVoter(fastify, pollId, 'Voter 1');
        const voter2 = await registerVoter(fastify, pollId, 'Voter 2');
        const voter3 = await registerVoter(fastify, pollId, 'Voter 3');
        expect(voter1.success).toBe(true);
        expect(voter2.success).toBe(true);
        expect(voter3.success).toBe(true);
        if (!voter1.success || !voter2.success || !voter3.success) {
            throw new Error('Failed to register voters.');
        }

        await closePoll(fastify, pollId, creatorToken);

        const voter1Keys = generateKeys(1, 3);
        const voter2Keys = generateKeys(2, 3);
        const voter3Keys = generateKeys(3, 3);

        await publicKeyShare(fastify, pollId, {
            publicKeyShare: voter1Keys.publicKey.toString(),
            voterToken: voter1.voterToken,
        });
        await publicKeyShare(fastify, pollId, {
            publicKeyShare: voter2Keys.publicKey.toString(),
            voterToken: voter2.voterToken,
        });
        await publicKeyShare(fastify, pollId, {
            publicKeyShare: voter3Keys.publicKey.toString(),
            voterToken: voter3.voterToken,
        });

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        let pollData = JSON.parse(response.body) as PollResponse;
        const commonPublicKey = BigInt(pollData.commonPublicKey!);
        const voter1Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 1, commonPublicKey)),
        );
        const voter2Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 2, commonPublicKey)),
        );
        const voter3Votes = choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 3, commonPublicKey)),
        );

        const response1 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: voter1Votes, voterToken: voter1.voterToken },
        });
        expect(response1.statusCode).toBe(200);

        const response2 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: voter2Votes, voterToken: voter2.voterToken },
        });
        expect(response2.statusCode).toBe(200);

        const response3 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: voter3Votes, voterToken: voter3.voterToken },
        });
        expect(response3.statusCode).toBe(200);

        const pollResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        pollData = JSON.parse(pollResponse.body) as PollResponse;
        expect(pollData.encryptedVotes.length).toBe(3);
        expect(pollData.encryptedTallies.length).toBe(3);
        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('should return 400 for an invalid poll ID', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/invalid-poll-id/vote',
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);
    });

    test('should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/00000000-0000-0000-0000-000000000000/vote',
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(404);
    });

    test('should return 400 for voting in an open poll', async () => {
        const openPollName = getUniquePollName('Open Poll');
        const { pollId, creatorToken } = await createPoll(
            fastify,
            openPollName,
        );

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });
});
