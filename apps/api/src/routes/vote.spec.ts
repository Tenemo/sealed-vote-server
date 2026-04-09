import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { FastifyInstance } from 'fastify';
import { encrypt, serializeEncryptedMessage } from 'threshold-elgamal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    deletePoll,
    fetchPoll,
    getUniquePollName,
    TestPollBuilder,
} from '../testUtils';

describe('POST /polls/:pollId/vote', () => {
    let fastify: FastifyInstance;
    const wrongButValidVoterToken = 'a'.repeat(64);
    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('should allow voters to cast their votes', async () => {
        const pollName = getUniquePollName('Vote test');
        const choices = ['Option 1', 'Option 2', 'Option 3'];

        const builder = new TestPollBuilder(fastify)
            .withPollName(pollName)
            .withChoices(choices)
            .withVoters(['Voter 1', 'Voter 2', 'Voter 3']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        if (!context.poll?.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const [voter1, voter2, voter3] = context.voters;
        const commonPublicKey = BigInt(context.poll.commonPublicKey);
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
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter1Votes, voterToken: voter1.voterToken },
        });
        expect(response1.statusCode).toBe(200);

        const response2 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter2Votes, voterToken: voter2.voterToken },
        });
        expect(response2.statusCode).toBe(200);

        const response3 = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: voter3Votes, voterToken: voter3.voterToken },
        });
        expect(response3.statusCode).toBe(200);

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.encryptedVoteCount).toBe(3);
        expect(pollData.encryptedTallies.length).toBe(3);
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
            url: '/api/polls/invalid-poll-id/vote',
            payload: { votes: [], voterToken: wrongButValidVoterToken },
        });
        expect(response.statusCode).toBe(400);
    });

    test('should return 404 for a non-existent poll', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/00000000-0000-0000-0000-000000000000/vote',
            payload: { votes: [], voterToken: wrongButValidVoterToken },
        });
        expect(response.statusCode).toBe(404);
    });

    test('should reject an invalid voter token format', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Invalid vote token'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: [], voterToken: 'short-token' },
        });

        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('should return 400 for voting in an open poll', async () => {
        const openPollName = getUniquePollName('Open Poll');
        const builder = new TestPollBuilder(fastify).withPollName(openPollName);

        await builder.create();
        await builder.registerVoters();
        const { creatorToken, pollId, voters } = builder.getContext();

        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${pollId}/vote`,
            payload: { votes: [], voterToken: voters[0].voterToken },
        });
        expect(response.statusCode).toBe(400);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('returns the voting phase error when encrypted votes are submitted before registration closes', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Open poll phase error'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();

        const context = builder.getContext();
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: {
                votes: [],
                voterToken: context.voters[0].voterToken,
            },
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            ERROR_MESSAGES.votingPhaseClosed,
        );

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('rejects vote vectors whose length does not match the number of poll choices', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Vote vector mismatch'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        const response = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: {
                votes: [],
                voterToken: context.voters[0].voterToken,
            },
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            ERROR_MESSAGES.voteVectorLengthMismatch,
        );

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('replays the same encrypted vote idempotently after the tally phase starts', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Idempotent vote replay'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        if (!context.poll?.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const [alice, bob] = context.voters;
        const commonPublicKey = BigInt(context.poll.commonPublicKey);
        const aliceVotes = context.poll.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 1, commonPublicKey)),
        );
        const bobVotes = context.poll.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 2, commonPublicKey)),
        );

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: aliceVotes, voterToken: alice.voterToken },
        });
        const secondResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: bobVotes, voterToken: bob.voterToken },
        });
        const replayResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: aliceVotes, voterToken: alice.voterToken },
        });

        expect(firstResponse.statusCode).toBe(200);
        expect(secondResponse.statusCode).toBe(200);
        expect(replayResponse.statusCode).toBe(200);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('rejects replaying a different encrypted vote for the same voter', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Conflicting vote replay'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        if (!context.poll?.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const [alice] = context.voters;
        const commonPublicKey = BigInt(context.poll.commonPublicKey);
        const firstVotes = context.poll.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 1, commonPublicKey)),
        );
        const conflictingVotes = context.poll.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 4, commonPublicKey)),
        );

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: { votes: firstVotes, voterToken: alice.voterToken },
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: `/api/polls/${context.pollId}/vote`,
            payload: {
                votes: conflictingVotes,
                voterToken: alice.voterToken,
            },
        });

        expect(firstResponse.statusCode).toBe(200);
        expect(conflictingResponse.statusCode).toBe(409);
        expect(
            (JSON.parse(conflictingResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.voteConflict);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('handles the last encrypted vote submissions correctly when they arrive together', async () => {
        const builder = new TestPollBuilder(fastify)
            .withPollName(getUniquePollName('Concurrent final vote'))
            .withChoices(['Option 1', 'Option 2'])
            .withVoters(['Alice', 'Bob']);

        await builder.create();
        await builder.registerVoters();
        await builder.close();
        await builder.submitPublicKeyShares();

        const context = builder.getContext();
        if (!context.poll?.commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const commonPublicKey = BigInt(context.poll.commonPublicKey);
        const [alice, bob] = context.voters;
        const aliceVotes = context.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 1, commonPublicKey)),
        );
        const bobVotes = context.choices.map((_, index) =>
            serializeEncryptedMessage(encrypt(index + 3, commonPublicKey)),
        );

        const [aliceResponse, bobResponse] = await Promise.all([
            fastify.inject({
                method: 'POST',
                url: `/api/polls/${context.pollId}/vote`,
                payload: { votes: aliceVotes, voterToken: alice.voterToken },
            }),
            fastify.inject({
                method: 'POST',
                url: `/api/polls/${context.pollId}/vote`,
                payload: { votes: bobVotes, voterToken: bob.voterToken },
            }),
        ]);

        expect(aliceResponse.statusCode).toBe(200);
        expect(bobResponse.statusCode).toBe(200);

        const pollData = await fetchPoll(fastify, context.pollId);
        expect(pollData.encryptedTallies).toHaveLength(context.choices.length);

        const deleteResult = await deletePoll(
            fastify,
            context.pollId,
            context.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });
});
