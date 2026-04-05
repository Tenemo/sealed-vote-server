import { FastifyInstance } from 'fastify';
import {
    createDecryptionShare,
    encrypt,
    generateKeys,
    serializeEncryptedMessage,
    deserializeEncryptedMessage,
} from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    createPoll,
    deletePoll,
    registerVoter,
    closePoll,
    publicKeyShare,
    vote,
    decryptionShares,
    getUniquePollName,
} from '../testUtils';

import { PollResponse } from './fetch';

describe('POST /polls/:pollId/decryption-shares', () => {
    let fastify: FastifyInstance;
    let pollId: string;
    let creatorToken: string;
    let commonPublicKey: bigint;
    let aliceToken: string;
    let bobToken: string;
    let charlieToken: string;
    let aliceKeys: { publicKey: bigint; privateKey: bigint };
    let bobKeys: { publicKey: bigint; privateKey: bigint };
    let charlieKeys: { publicKey: bigint; privateKey: bigint };
    let encryptedTallies: { c1: string; c2: string }[];

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Should create a poll, register voters, close the poll, and submit public key shares', async () => {
        const pollName = getUniquePollName('Decryption shares test');
        const choices = ['Option 1', 'Option 2', 'Option 3'];

        const pollCreationData = await createPoll(fastify, pollName, choices);
        pollId = pollCreationData.pollId;
        creatorToken = pollCreationData.creatorToken;

        const alice = await registerVoter(fastify, pollId, 'Alice');
        const bob = await registerVoter(fastify, pollId, 'Bob');
        const charlie = await registerVoter(fastify, pollId, 'Charlie');
        expect(alice.success).toBe(true);
        expect(bob.success).toBe(true);
        expect(charlie.success).toBe(true);
        if (!alice.success || !bob.success || !charlie.success) {
            throw new Error('Failed to register voters.');
        }
        aliceToken = alice.voterToken;
        bobToken = bob.voterToken;
        charlieToken = charlie.voterToken;

        await closePoll(fastify, pollId, creatorToken);

        aliceKeys = generateKeys(1, 3);
        bobKeys = generateKeys(2, 3);
        charlieKeys = generateKeys(3, 3);

        await publicKeyShare(fastify, pollId, {
            publicKeyShare: aliceKeys.publicKey.toString(),
            voterToken: aliceToken,
        });
        await publicKeyShare(fastify, pollId, {
            publicKeyShare: bobKeys.publicKey.toString(),
            voterToken: bobToken,
        });
        await publicKeyShare(fastify, pollId, {
            publicKeyShare: charlieKeys.publicKey.toString(),
            voterToken: charlieToken,
        });

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const pollData = JSON.parse(response.body) as PollResponse;
        commonPublicKey = BigInt(pollData.commonPublicKey!);
    });

    test('Should allow voters to submit votes', async () => {
        const votesAlice = [1, 2, 3].map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );
        const votesBob = [4, 5, 6].map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );
        const votesCharlie = [7, 8, 9].map((score) =>
            serializeEncryptedMessage(encrypt(score, commonPublicKey)),
        );

        await vote(fastify, pollId, {
            votes: votesAlice,
            voterToken: aliceToken,
        });
        await vote(fastify, pollId, {
            votes: votesBob,
            voterToken: bobToken,
        });
        await vote(fastify, pollId, {
            votes: votesCharlie,
            voterToken: charlieToken,
        });

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const pollData = JSON.parse(response.body) as PollResponse;
        encryptedTallies = pollData.encryptedTallies;
    });

    test('Should allow voters to submit decryption shares', async () => {
        const decryptionSharesAlice = encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                aliceKeys.privateKey,
            ).toString(),
        );
        const decryptionSharesBob = encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                bobKeys.privateKey,
            ).toString(),
        );
        const decryptionSharesCharlie = encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                charlieKeys.privateKey,
            ).toString(),
        );

        await decryptionShares(fastify, pollId, {
            decryptionShares: decryptionSharesAlice,
            voterToken: aliceToken,
        });
        await decryptionShares(fastify, pollId, {
            decryptionShares: decryptionSharesBob,
            voterToken: bobToken,
        });
        await decryptionShares(fastify, pollId, {
            decryptionShares: decryptionSharesCharlie,
            voterToken: charlieToken,
        });

        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });
        const pollData = JSON.parse(response.body) as PollResponse;
        expect(pollData.decryptionShares.length).toBe(3);
    });

    test('Should return 400 for an invalid poll ID', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/invalid-poll-id/decryption-shares',
            payload: { decryptionShares: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);
    });

    test('Should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/48a16d54-1a44-1234-1234-67083a00e107/decryption-shares',
            payload: {
                decryptionShares: [''],
                voterToken: 'invalid-token',
            },
        });
        expect(response.statusCode).toBe(404);
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
