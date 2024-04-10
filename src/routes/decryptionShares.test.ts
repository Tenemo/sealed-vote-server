import { FastifyInstance } from 'fastify';
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
import {
    createDecryptionShare,
    encrypt,
    generateKeys,
} from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PollResponse } from './fetch';
import {
    serializeEncryptedMessage,
    deserializeEncryptedMessage,
} from '../utils';

describe('POST /polls/:pollId/decryption-shares', () => {
    let fastify: FastifyInstance;
    let pollId: string;
    let creatorToken: string;
    let commonPublicKey: bigint;
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

        await registerVoter(fastify, pollId, 'Alice');
        await registerVoter(fastify, pollId, 'Bob');
        await registerVoter(fastify, pollId, 'Charlie');

        await closePoll(fastify, pollId, creatorToken);

        aliceKeys = generateKeys(1, 3);
        bobKeys = generateKeys(2, 3);
        charlieKeys = generateKeys(3, 3);

        await publicKeyShare(fastify, pollId, aliceKeys.publicKey.toString());
        await publicKeyShare(fastify, pollId, bobKeys.publicKey.toString());
        await publicKeyShare(fastify, pollId, charlieKeys.publicKey.toString());

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

        await vote(fastify, pollId, votesAlice);
        await vote(fastify, pollId, votesBob);
        await vote(fastify, pollId, votesCharlie);

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

        await decryptionShares(fastify, pollId, decryptionSharesAlice);
        await decryptionShares(fastify, pollId, decryptionSharesBob);
        await decryptionShares(fastify, pollId, decryptionSharesCharlie);

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
            payload: { decryptionShares: [] },
        });
        expect(response.statusCode).toBe(400);
    });

    test('Should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/48a16d54-1a44-1234-1234-67083a00e107/decryption-shares',
            payload: { decryptionShares: [['']] },
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
