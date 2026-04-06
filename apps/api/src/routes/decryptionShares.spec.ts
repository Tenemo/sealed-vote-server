import { FastifyInstance } from 'fastify';
import {
    createDecryptionShare,
    deserializeEncryptedMessage,
} from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    decryptionShares,
    deletePoll,
    fetchPoll,
    getUniquePollName,
    TestPollBuilder,
} from '../testUtils';

describe('POST /polls/:pollId/decryption-shares', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should allow voters to submit decryption shares after tallies exist', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Decryption shares test'))
            .withChoices(['Option 1', 'Option 2', 'Option 3'])
            .withVoters(['Alice', 'Bob', 'Charlie']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        if (!context.poll) {
            throw new Error('Poll state is missing.');
        }

        const [alice, bob, charlie] = context.voters;
        if (!alice?.privateKey || !bob?.privateKey || !charlie?.privateKey) {
            throw new Error('Expected private keys for all voters.');
        }
        const alicePrivateKey = alice.privateKey;
        const bobPrivateKey = bob.privateKey;
        const charliePrivateKey = charlie.privateKey;

        const decryptionSharesAlice = context.poll.encryptedTallies.map(
            (tally) =>
                createDecryptionShare(
                    deserializeEncryptedMessage(tally),
                    BigInt(alicePrivateKey),
                ).toString(),
        );
        const decryptionSharesBob = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(bobPrivateKey),
            ).toString(),
        );
        const decryptionSharesCharlie = context.poll.encryptedTallies.map(
            (tally) =>
                createDecryptionShare(
                    deserializeEncryptedMessage(tally),
                    BigInt(charliePrivateKey),
                ).toString(),
        );

        await decryptionShares(fastify, context.pollId, {
            decryptionShares: decryptionSharesAlice,
            voterToken: alice.voterToken,
        });
        await decryptionShares(fastify, context.pollId, {
            decryptionShares: decryptionSharesBob,
            voterToken: bob.voterToken,
        });
        await decryptionShares(fastify, context.pollId, {
            decryptionShares: decryptionSharesCharlie,
            voterToken: charlie.voterToken,
        });

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.decryptionShareCount).toBe(3);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('should return 400 for an invalid poll ID', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/invalid-poll-id/decryption-shares',
            payload: { decryptionShares: [], voterToken: 'invalid-token' },
        });
        expect(response.statusCode).toBe(400);
    });

    test('should return 404 for a non-existent poll', async () => {
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
});
