import sql from '@nearform/sql';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import { isConstraintViolation, withTransaction } from '../utils/db';
import { authenticateVoter } from '../utils/voterAuth';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    VoteRequest as VoteRequestContract,
    VoteResponse as VoteResponseContract,
} from '@sealed-vote/contracts';
import { computeEncryptedTallies } from '@sealed-vote/protocol';

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
                    const pollQuery = sql`
                        SELECT
                            id,
                            is_open,
                            common_public_key,
                            encrypted_tallies,
                            results
                        FROM polls
                        WHERE id = ${pollId}
                        FOR UPDATE
                    `;
                    const { rows: polls } = await client.query<{
                        id: string;
                        is_open: boolean;
                        common_public_key: string | null;
                        encrypted_tallies: { c1: string; c2: string }[];
                        results: number[];
                    }>(pollQuery);

                    const poll = polls[0];
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (
                        poll.is_open ||
                        !poll.common_public_key ||
                        poll.encrypted_tallies.length > 0 ||
                        poll.results.length > 0
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

                    const choiceCountQuery = sql`
                        SELECT COUNT(*) AS choice_count
                        FROM choices
                        WHERE poll_id = ${pollId}
                    `;
                    const { rows: choiceCounts } = await client.query<{
                        choice_count: string;
                    }>(choiceCountQuery);
                    const choiceCount = Number(choiceCounts[0].choice_count);

                    if (votes.length !== choiceCount) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.voteVectorLengthMismatch,
                        );
                    }

                    const insertVoteQuery = sql`
                        INSERT INTO encrypted_votes (poll_id, voter_id, votes)
                        VALUES (${pollId}, ${voter.id}, ${JSON.stringify(votes)}::jsonb)
                    `;
                    await client.query(insertVoteQuery);

                    const updateVoterQuery = sql`
                        UPDATE voters
                        SET has_voted = true
                        WHERE id = ${voter.id}
                    `;
                    await client.query(updateVoterQuery);

                    const votesQuery = sql`
                        SELECT encrypted_votes.votes
                        FROM encrypted_votes
                        INNER JOIN voters ON voters.id = encrypted_votes.voter_id
                        WHERE encrypted_votes.poll_id = ${pollId}
                        ORDER BY voters.voter_index
                    `;
                    const { rows: encryptedVoteRows } = await client.query<{
                        votes: { c1: string; c2: string }[];
                    }>(votesQuery);

                    const voterCountQuery = sql`
                        SELECT COUNT(*) AS voters_count
                        FROM voters
                        WHERE poll_id = ${pollId}
                    `;
                    const { rows: voterCounts } = await client.query<{
                        voters_count: string;
                    }>(voterCountQuery);
                    const votersCount = Number(voterCounts[0].voters_count);

                    if (encryptedVoteRows.length === votersCount) {
                        const encryptedTallies = computeEncryptedTallies(
                            encryptedVoteRows.map(
                                ({ votes: encryptedVotes }) => encryptedVotes,
                            ),
                        );
                        const updateTalliesQuery = sql`
                            UPDATE polls
                            SET encrypted_tallies = ${JSON.stringify(encryptedTallies)}::jsonb
                            WHERE id = ${pollId}
                        `;
                        await client.query(updateTalliesQuery);
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
