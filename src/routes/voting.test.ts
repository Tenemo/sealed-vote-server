import { FastifyInstance } from 'fastify';
import {
    createDecryptionShare,
    encrypt,
    generateKeys,
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
    vote,
    decryptionShares,
} from '../testUtils';
import {
    serializeEncryptedMessage,
    deserializeEncryptedMessage,
} from '../utils';

import { PollResponse } from './fetch';

describe('E2E voting test', () => {
    let fastify: FastifyInstance;
    let pollId: string;
    let creatorToken: string;
    let commonPublicKey: bigint;
    let aliceKeys: { publicKey: bigint; privateKey: bigint };
    let bobKeys: { publicKey: bigint; privateKey: bigint };
    let charlieKeys: { publicKey: bigint; privateKey: bigint };

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    const pollName = getUniquePollName('Which animal should we get?');
    const choices = ['Dog', 'Cat', 'Cow', 'Goat'];
    const threshold = 3;
    const aliceChosenScores = [10, 2, 3, 9];
    const bobChosenScores = [5, 6, 7, 8];
    const charlieChosenScores = [9, 10, 1, 4];

    const expectedResults = aliceChosenScores.map(
        (score, index) =>
            score * bobChosenScores[index] * charlieChosenScores[index],
    );

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

    test('Should allow voters to submit public key shares and form the common public key', async () => {
        aliceKeys = generateKeys(1, threshold);
        bobKeys = generateKeys(2, threshold);
        charlieKeys = generateKeys(3, threshold);

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

        commonPublicKey = BigInt(pollData.commonPublicKey!);
    });

    test('Should allow voters to submit votes after public key shares are submitted', async () => {
        const votesAlice = aliceChosenScores.map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );
        const votesBob = bobChosenScores.map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );
        const votesCharlie = charlieChosenScores.map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );

        await vote(fastify, pollId, votesAlice);
        await vote(fastify, pollId, votesBob);
        await vote(fastify, pollId, votesCharlie);

        // Fetch the poll to verify votes are encrypted and stored
        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.encryptedVotes.length).toBe(threshold);
        expect(pollData.encryptedTallies.length).toBe(aliceChosenScores.length);
    });

    test('Should generate and submit decryption shares once votes are tallied', async () => {
        let response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        let pollData = JSON.parse(response.body) as PollResponse;

        if (pollData.encryptedTallies.length === 0) {
            throw new Error(
                'Encrypted tallies are not there. Nothing to create shares for.',
            );
        }
        const decryptionSharesAlice = pollData.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                aliceKeys.privateKey,
            ).toString(),
        );
        const decryptionSharesBob = pollData.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                bobKeys.privateKey,
            ).toString(),
        );
        const decryptionSharesCharlie = pollData.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                charlieKeys.privateKey,
            ).toString(),
        );
        expect(decryptionSharesAlice.length).toBe(aliceChosenScores.length);
        expect(decryptionSharesBob.length).toBe(bobChosenScores.length);
        expect(decryptionSharesCharlie.length).toBe(charlieChosenScores.length);
        await decryptionShares(fastify, pollId, decryptionSharesAlice);
        await decryptionShares(fastify, pollId, decryptionSharesBob);
        await decryptionShares(fastify, pollId, decryptionSharesCharlie);
        response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        pollData = JSON.parse(response.body) as PollResponse;

        expect(pollData.decryptionShares).toBeDefined();
        expect(pollData.decryptionShares.length).toBeGreaterThan(0);

        expect(Array.isArray(pollData.decryptionShares[0])).toBeTruthy();
        expect(pollData.decryptionShares[0].length).toBe(
            bobChosenScores.length,
        );
    });
    test('Should calculate the final results and compare with expected ones', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        expect(response.statusCode).toBe(200);

        const pollData = JSON.parse(response.body) as PollResponse;

        expect(pollData.results).toBeDefined();
        expect(pollData.results.length).toBe(choices.length);
        pollData.results.forEach((result, index) => {
            expect(result).toBe(expectedResults[index]);
        });
    });

    test('Should delete the poll after the voting process is complete', async () => {
        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        expect(response.statusCode).toBe(404);
    });
});
