import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    VoteRequest as VoteRequestContract,
    VoteResponse as VoteResponseContract,
} from '@sealed-vote/contracts';
import { canVote, computeEncryptedTallies } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { encryptedVotes, polls } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import {
    countPollChoices,
    countPollEncryptedVotes,
    countPollVoters,
    getOrderedPollEncryptedVotes,
    lockPollById,
} from '../utils/polls.js';
import { authenticateVoter } from '../utils/voterAuth.js';

import {
    EncryptedMessageSchema,
    MessageResponseSchema,
    PollIdParamsSchema,
    type PollIdParams,
} from './schemas.js';

export const VoteRequestSchema = Type.Object({
    votes: Type.Array(EncryptedMessageSchema),
    voterToken: Type.String(),
});

const VoteResponseSchema = Type.String();

const schema = {
    params: PollIdParamsSchema,
    body: VoteRequestSchema,
    response: {
        200: VoteResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

export type VoteRequest = VoteRequestContract;
export type VoteResponse = VoteResponseContract;

export const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/vote',
        { schema },
        async (
            req: FastifyRequest<{
                Body: VoteRequest;
                Params: PollIdParams;
            }>,
        ): Promise<VoteResponse> => {
            try {
                const { votes, voterToken } = req.body;
                const { pollId } = req.params;

                return await withTransaction(fastify, async (client) => {
                    const poll = await lockPollById(client, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    const [voterCount, encryptedVoteCount] = await Promise.all([
                        countPollVoters(client, pollId),
                        countPollEncryptedVotes(client, pollId),
                    ]);

                    if (
                        !canVote({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount,
                            encryptedVoteCount,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultCount: poll.results.length,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.votingPhaseClosed,
                        );
                    }

                    const voter = await authenticateVoter(
                        client,
                        pollId,
                        voterToken,
                    );

                    const choiceCount = await countPollChoices(client, pollId);

                    if (votes.length !== choiceCount) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.voteVectorLengthMismatch,
                        );
                    }

                    await client.insert(encryptedVotes).values({
                        pollId,
                        voterId: voter.id,
                        votes,
                    });

                    const encryptedVoteRows =
                        await getOrderedPollEncryptedVotes(client, pollId);

                    if (encryptedVoteRows.length === voterCount) {
                        const encryptedTallies = computeEncryptedTallies(
                            encryptedVoteRows.map(
                                ({ votes: encryptedVoteSet }) =>
                                    encryptedVoteSet,
                            ),
                        );
                        await client
                            .update(polls)
                            .set({
                                encryptedTallies,
                            })
                            .where(eq(polls.id, pollId));
                    }

                    return 'Vote submitted successfully';
                });
            } catch (error) {
                if (isConstraintViolation(error, 'unique_vote_per_voter')) {
                    throw createError(409, ERROR_MESSAGES.voteAlreadySubmitted);
                }

                throw error;
            }
        },
    );
};
