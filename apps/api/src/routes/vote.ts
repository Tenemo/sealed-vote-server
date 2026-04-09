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
import { areEncryptedMessagesEqual } from '../utils/idempotency.js';
import {
    countPollChoices,
    countPollEncryptedVotes,
    countPollVoters,
} from '../utils/pollCounts.js';
import { executeVoterPhaseSubmission } from '../utils/pollPhaseSubmission.js';
import {
    getExistingPollSubmissionValue,
    getOrderedPollSubmissionValues,
} from '../utils/pollSubmissions.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';

import {
    EncryptedMessageSchema,
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const VoteRequestSchema = Type.Object({
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

type VoteRequest = VoteRequestContract;
type VoteResponse = VoteResponseContract;

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
            const successResponse = 'Vote submitted successfully';
            const { votes, voterToken } = req.body;
            const { pollId } = req.params;
            const response = await executeVoterPhaseSubmission<
                VoteRequest['votes'],
                typeof encryptedVotes.$inferSelect.votes,
                VoteResponse,
                {
                    choiceCount: number;
                    encryptedVoteCount: number;
                    voterCount: number;
                }
            >({
                conflictMessage: ERROR_MESSAGES.voteConflict,
                fastify,
                incomingValue: votes,
                isEquivalent: (existingVotes, nextVotes) =>
                    areEncryptedMessagesEqual(existingVotes, nextVotes),
                loadExtra: async ({ tx, pollId: currentPollId }) => {
                    const [choiceCount, encryptedVoteCount, voterCount] =
                        await Promise.all([
                            countPollChoices(tx, currentPollId),
                            countPollEncryptedVotes(tx, currentPollId),
                            countPollVoters(tx, currentPollId),
                        ]);

                    return {
                        choiceCount,
                        encryptedVoteCount,
                        voterCount,
                    };
                },
                loadExistingSubmission: async ({
                    db,
                    pollId: currentPollId,
                    shouldLock,
                    voterId,
                }) =>
                    await getExistingPollSubmissionValue<
                        typeof encryptedVotes.$inferSelect.votes
                    >({
                        db,
                        pollId: currentPollId,
                        shouldLock,
                        table: encryptedVotes,
                        valueColumn: encryptedVotes.votes,
                        voterId,
                    }),
                pollId,
                run: async ({
                    extra: { voterCount },
                    incomingValue,
                    pollId: currentPollId,
                    tx,
                    voter,
                }) => {
                    await tx.insert(encryptedVotes).values({
                        pollId: currentPollId,
                        voterId: voter.id,
                        votes: incomingValue,
                    });

                    const votesByVoter = await getOrderedPollSubmissionValues<
                        typeof encryptedVotes.$inferSelect.votes
                    >({
                        db: tx,
                        pollId: currentPollId,
                        table: encryptedVotes,
                        valueColumn: encryptedVotes.votes,
                    });

                    if (votesByVoter.length === voterCount) {
                        const encryptedTallies =
                            computeEncryptedTallies(votesByVoter);

                        await tx
                            .update(polls)
                            .set({
                                encryptedTallies,
                            })
                            .where(eq(polls.id, currentPollId));
                    }
                },
                successResponse,
                uniqueConstraintName: 'unique_vote_per_voter',
                validate: ({
                    extra: { choiceCount, encryptedVoteCount, voterCount },
                    incomingValue,
                    poll,
                }) => {
                    if (
                        !canVote({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount,
                            encryptedVoteCount,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultScoreCount: poll.resultScores.length,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.votingPhaseClosed,
                        );
                    }

                    if (incomingValue.length === choiceCount) {
                        return;
                    }

                    throw createError(
                        400,
                        ERROR_MESSAGES.voteVectorLengthMismatch,
                    );
                },
                voterToken,
            });

            void maybeDropTestResponseAfterCommit({
                reply,
                request: req,
            });

            return response;
        },
    );
};
