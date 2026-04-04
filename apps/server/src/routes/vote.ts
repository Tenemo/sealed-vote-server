import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    VoteRequest as VoteRequestContract,
    VoteResponse as VoteResponseContract,
} from '@sealed-vote/contracts';
import { canVote, computeEncryptedTallies } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { asc, eq, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import { encryptedVotes, polls, voters } from '../db/schema';
import { isConstraintViolation, withTransaction } from '../utils/db';
import { authenticateVoter } from '../utils/voterAuth';

const EncryptedMessageSchema = Type.Object({
    c1: Type.String(),
    c2: Type.String(),
});

export const VoteRequestSchema = Type.Object({
    votes: Type.Array(EncryptedMessageSchema),
    voterToken: Type.String(),
});

const VoteResponseSchema = Type.String();

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
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
export type VoteErrorResponse = MessageResponse;

export const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/vote',
        { schema },
        async (
            req: FastifyRequest<{
                Body: VoteRequest;
                Params: { pollId: string };
            }>,
        ): Promise<VoteResponse> => {
            try {
                const { votes, voterToken } = req.body;
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                return await withTransaction(fastify, async (client) => {
                    const pollResult = await client.execute(sql`
                        SELECT
                            id,
                            is_open,
                            common_public_key,
                            jsonb_array_length(encrypted_tallies)::int AS encrypted_tally_count,
                            COALESCE(array_length(results, 1), 0)::int AS result_count,
                            (
                                SELECT COUNT(*)::int
                                FROM voters
                                WHERE poll_id = ${pollId}
                            ) AS voter_count
                        FROM polls
                        WHERE id = ${pollId}
                        FOR UPDATE
                    `);
                    const pollRows = pollResult.rows as Array<{
                        id: string;
                        is_open: boolean;
                        common_public_key: string | null;
                        encrypted_tally_count: number;
                        result_count: number;
                        voter_count: number;
                    }>;

                    const poll = pollRows[0];
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (
                        !canVote({
                            isOpen: poll.is_open,
                            commonPublicKey: poll.common_public_key,
                            voterCount: poll.voter_count,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encrypted_tally_count,
                            resultCount: poll.result_count,
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
                    if (voter.hasVoted) {
                        throw createError(
                            409,
                            ERROR_MESSAGES.voteAlreadySubmitted,
                        );
                    }

                    const choiceCountResult = await client.execute(sql`
                        SELECT COUNT(*) AS choice_count
                        FROM choices
                        WHERE poll_id = ${pollId}
                    `);
                    const choiceCounts = choiceCountResult.rows as Array<{
                        choice_count: string | number;
                    }>;
                    const choiceCount = Number(choiceCounts[0].choice_count);

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

                    await client
                        .update(voters)
                        .set({ hasVoted: true })
                        .where(eq(voters.id, voter.id));

                    const encryptedVoteRows = await client
                        .select({
                            votes: encryptedVotes.votes,
                        })
                        .from(encryptedVotes)
                        .innerJoin(
                            voters,
                            eq(voters.id, encryptedVotes.voterId),
                        )
                        .where(eq(encryptedVotes.pollId, pollId))
                        .orderBy(asc(voters.voterIndex));

                    if (encryptedVoteRows.length === poll.voter_count) {
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

                    return `Voted successfully in poll ${pollId}.`;
                });
            } catch (error) {
                if (isConstraintViolation(error, 'unique_vote_per_voter')) {
                    throw createError(409, ERROR_MESSAGES.voteAlreadySubmitted);
                }

                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }

                throw error;
            }
        },
    );
};
