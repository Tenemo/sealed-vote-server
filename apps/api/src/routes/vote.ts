import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    VoteRequest as VoteRequestContract,
    VoteResponse as VoteResponseContract,
} from '@sealed-vote/contracts';
import { canVote, computeEncryptedTallies } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { encryptedVotes, polls } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { areEncryptedMessagesEqual } from '../utils/idempotency.js';
import {
    countPollChoices,
    countPollEncryptedVotes,
    countPollVoters,
    getExistingEncryptedVote,
    getOrderedPollEncryptedVotes,
    lockPollById,
} from '../utils/polls.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { authenticateVoter, hashSecureToken } from '../utils/voterAuth.js';

import {
    EncryptedMessageSchema,
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

export const VoteRequestSchema = Type.Object({
    votes: Type.Array(EncryptedMessageSchema),
    voterToken: SecureTokenSchema,
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
            reply: FastifyReply,
        ): Promise<VoteResponse> => {
            try {
                const { votes, voterToken } = req.body;
                const { pollId } = req.params;

                const response = await withTransaction(
                    fastify,
                    async (client) => {
                        const poll = await lockPollById(client, pollId);
                        if (!poll) {
                            throw createError(
                                404,
                                `Poll with ID ${pollId} does not exist.`,
                            );
                        }

                        const [voterCount, encryptedVoteCount] =
                            await Promise.all([
                                countPollVoters(client, pollId),
                                countPollEncryptedVotes(client, pollId),
                            ]);

                        const voter = await authenticateVoter(
                            client,
                            pollId,
                            voterToken,
                        );

                        const existingVote = await getExistingEncryptedVote(
                            client,
                            pollId,
                            voter.id,
                        );

                        if (existingVote) {
                            if (
                                !areEncryptedMessagesEqual(
                                    existingVote.votes,
                                    votes,
                                )
                            ) {
                                throw createError(
                                    409,
                                    ERROR_MESSAGES.voteConflict,
                                );
                            }

                            return 'Vote submitted successfully';
                        }

                        if (
                            !canVote({
                                isOpen: poll.isOpen,
                                commonPublicKey: poll.commonPublicKey,
                                voterCount,
                                encryptedVoteCount,
                                encryptedTallyCount:
                                    poll.encryptedTallies.length,
                                resultCount: poll.results.length,
                            })
                        ) {
                            throw createError(
                                400,
                                ERROR_MESSAGES.votingPhaseClosed,
                            );
                        }

                        const choiceCount = await countPollChoices(
                            client,
                            pollId,
                        );

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
                    },
                );

                void maybeDropTestResponseAfterCommit({
                    reply,
                    request: req,
                });

                return response;
            } catch (error) {
                if (isConstraintViolation(error, 'unique_vote_per_voter')) {
                    const voter = await fastify.db.query.voters.findFirst({
                        where: (fields, { and, eq: isEqual }) =>
                            and(
                                isEqual(fields.pollId, req.params.pollId),
                                isEqual(
                                    fields.voterTokenHash,
                                    hashSecureToken(req.body.voterToken),
                                ),
                            ),
                    });

                    const existingVote =
                        voter &&
                        (await fastify.db.query.encryptedVotes.findFirst({
                            where: (fields, { and, eq: isEqual }) =>
                                and(
                                    isEqual(fields.pollId, req.params.pollId),
                                    isEqual(fields.voterId, voter.id),
                                ),
                            columns: {
                                votes: true,
                            },
                        }));

                    if (
                        existingVote &&
                        areEncryptedMessagesEqual(
                            existingVote.votes,
                            req.body.votes,
                        )
                    ) {
                        void maybeDropTestResponseAfterCommit({
                            reply,
                            request: req,
                        });
                        return 'Vote submitted successfully';
                    }

                    throw createError(409, ERROR_MESSAGES.voteConflict);
                }

                throw error;
            }
        },
    );
};
