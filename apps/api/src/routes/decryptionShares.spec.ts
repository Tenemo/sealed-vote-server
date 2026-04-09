import { ERROR_MESSAGES } from '@sealed-vote/contracts';
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
    const wrongButValidVoterToken = 'a'.repeat(64);

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
            payload: {
                decryptionShares: [],
                voterToken: wrongButValidVoterToken,
            },
        });
        expect(response.statusCode).toBe(400);
    });

    test('should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/48a16d54-1a44-1234-1234-67083a00e107/decryption-shares',
            payload: {
                decryptionShares: [''],
                voterToken: wrongButValidVoterToken,
            },
        });
        expect(response.statusCode).toBe(404);
    });

    test('should reject an invalid voter token format', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Invalid decryption token'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: [],
                voterToken: 'short-token',
            },
        });

        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('returns the decryption phase error when shares are submitted before tallies exist', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Early decryption shares'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        const [alice] = context.voters;
        if (!alice?.privateKey) {
            throw new Error('Expected a private key for Alice.');
        }

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: ['1', '2'],
                voterToken: alice.voterToken,
            },
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            ERROR_MESSAGES.decryptionPhaseClosed,
        );

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('rejects decryption-share vectors whose length does not match the encrypted tally count', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Decryption vector mismatch'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: ['1'],
                voterToken: context.voters[0].voterToken,
            },
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            ERROR_MESSAGES.decryptionVectorLengthMismatch,
        );

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('replays the same decryption shares idempotently after results are computed', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Idempotent decryption replay'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        if (!context.poll) {
            throw new Error('Poll state is missing.');
        }

        const [alice, bob] = context.voters;
        if (!alice?.privateKey || !bob?.privateKey) {
            throw new Error('Expected private keys for all voters.');
        }
        const alicePrivateKey = alice.privateKey;
        const bobPrivateKey = bob.privateKey;

        const aliceShares = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(alicePrivateKey),
            ).toString(),
        );
        const bobShares = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(bobPrivateKey),
            ).toString(),
        );

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: aliceShares,
                voterToken: alice.voterToken,
            },
        });
        const secondResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: bobShares,
                voterToken: bob.voterToken,
            },
        });
        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: aliceShares,
                voterToken: alice.voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(secondResponse.statusCode).toBe(201);
        expect(replayResponse.statusCode).toBe(201);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('rejects replaying different decryption shares for the same voter', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Conflicting decryption replay'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        if (!context.poll) {
            throw new Error('Poll state is missing.');
        }

        const [alice] = context.voters;
        if (!alice?.privateKey) {
            throw new Error('Expected a private key for Alice.');
        }
        const alicePrivateKey = alice.privateKey;

        const firstShares = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(alicePrivateKey),
            ).toString(),
        );
        const conflictingShares = firstShares.map((share) =>
            (BigInt(share) + 1n).toString(),
        );

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: firstShares,
                voterToken: alice.voterToken,
            },
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/decryption-shares`,
            payload: {
                decryptionShares: conflictingShares,
                voterToken: alice.voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(conflictingResponse.statusCode).toBe(409);
        expect(
            (JSON.parse(conflictingResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.decryptionSharesConflict);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('handles the last decryption share submissions correctly when they arrive together', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Concurrent final decryption'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();
        await builder.submitVotes();

        const context = builder.getContext();
        if (!context.poll) {
            throw new Error('Poll state is missing.');
        }

        const [alice, bob] = context.voters;
        if (!alice?.privateKey || !bob?.privateKey) {
            throw new Error('Expected private keys for all voters.');
        }
        const alicePrivateKey = alice.privateKey;
        const bobPrivateKey = bob.privateKey;

        const aliceShares = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(alicePrivateKey),
            ).toString(),
        );
        const bobShares = context.poll.encryptedTallies.map((tally) =>
            createDecryptionShare(
                deserializeEncryptedMessage(tally),
                BigInt(bobPrivateKey),
            ).toString(),
        );

        const [aliceResponse, bobResponse] = await Promise.all([
            fastify.inject({
                method: 'POST',
                url: `/api/polls/${context.pollId}/decryption-shares`,
                payload: {
                    decryptionShares: aliceShares,
                    voterToken: alice.voterToken,
                },
            }),
            fastify.inject({
                method: 'POST',
                url: `/api/polls/${context.pollId}/decryption-shares`,
                payload: {
                    decryptionShares: bobShares,
                    voterToken: bob.voterToken,
                },
            }),
        ]);

        expect(aliceResponse.statusCode).toBe(201);
        expect(bobResponse.statusCode).toBe(201);

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.resultScores).toHaveLength(context.choices.length);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });
});
