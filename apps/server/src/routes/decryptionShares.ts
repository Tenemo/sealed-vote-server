import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    DecryptionSharesRequest as DecryptionSharesRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import {
    canSubmitDecryptionShares,
    decryptTallies,
} from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { asc, eq, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import {
    decryptionShares as decryptionSharesTable,
    polls,
    voters,
} from '../db/schema';
import { isConstraintViolation, withTransaction } from '../utils/db';
import { authenticateVoter } from '../utils/voterAuth';

const DecryptionSharesRequestSchema = Type.Object({
    decryptionShares: Type.Array(Type.String()),
    voterToken: Type.String(),
});

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
    body: DecryptionSharesRequestSchema,
    response: {
        201: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

export type DecryptionSharesRequest = DecryptionSharesRequestContract;
export type DecryptionSharesResponse = MessageResponse;

export const decryptionShares = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/decryption-shares',
        { schema },
        async (
            req: FastifyRequest<{
                Body: DecryptionSharesRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<DecryptionSharesResponse> => {
            try {
                const { pollId } = req.params;
                const { decryptionShares: shares, voterToken } = req.body;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                const response = await withTransaction(fastify, async (tx) => {
                    const pollResult = await tx.execute(sql`
                        SELECT
                            is_open,
                            common_public_key,
                            encrypted_tallies,
                            jsonb_array_length(encrypted_tallies)::int AS encrypted_tally_count,
                            COALESCE(array_length(results, 1), 0)::int AS result_count
                        FROM polls
                        WHERE id = ${pollId}
                        FOR UPDATE
                    `);
                    const pollRows = pollResult.rows as Array<{
                        is_open: boolean;
                        common_public_key: string | null;
                        encrypted_tallies: { c1: string; c2: string }[];
                        encrypted_tally_count: number;
                        result_count: number;
                    }>;

                    const poll = pollRows[0];
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (
                        !canSubmitDecryptionShares({
                            isOpen: poll.is_open,
                            commonPublicKey: poll.common_public_key,
                            voterCount: 0,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encrypted_tally_count,
                            resultCount: poll.result_count,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.decryptionPhaseClosed,
                        );
                    }

                    const voter = await authenticateVoter(
                        tx,
                        pollId,
                        voterToken,
                    );
                    if (voter.hasSubmittedDecryptionShares) {
                        throw createError(
                            409,
                            ERROR_MESSAGES.decryptionSharesAlreadySubmitted,
                        );
                    }

                    if (shares.length !== poll.encrypted_tallies.length) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.decryptionVectorLengthMismatch,
                        );
                    }

                    await tx.insert(decryptionSharesTable).values({
                        pollId,
                        voterId: voter.id,
                        shares,
                    });

                    await tx
                        .update(voters)
                        .set({ hasSubmittedDecryptionShares: true })
                        .where(eq(voters.id, voter.id));

                    const decryptionShareRows = await tx
                        .select({
                            shares: decryptionSharesTable.shares,
                        })
                        .from(decryptionSharesTable)
                        .innerJoin(
                            voters,
                            eq(voters.id, decryptionSharesTable.voterId),
                        )
                        .where(eq(decryptionSharesTable.pollId, pollId))
                        .orderBy(asc(voters.voterIndex));

                    const voterCountResult = await tx.execute(sql`
                        SELECT COUNT(*) AS voters_count
                        FROM voters
                        WHERE poll_id = ${pollId}
                    `);
                    const voterCounts = voterCountResult.rows as Array<{
                        voters_count: string | number;
                    }>;
                    const votersCount = Number(voterCounts[0].voters_count);

                    if (decryptionShareRows.length === votersCount) {
                        const results = decryptTallies(
                            poll.encrypted_tallies,
                            decryptionShareRows.map(
                                ({ shares: voterShares }) => voterShares,
                            ),
                        );
                        await tx
                            .update(polls)
                            .set({ results })
                            .where(eq(polls.id, pollId));
                    }

                    return {
                        message: 'Decryption shares submitted successfully.',
                    };
                });

                void reply.code(201);
                return response;
            } catch (error) {
                if (
                    isConstraintViolation(
                        error,
                        'unique_decryption_shares_per_voter',
                    )
                ) {
                    throw createError(
                        409,
                        ERROR_MESSAGES.decryptionSharesAlreadySubmitted,
                    );
                }

                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }

                throw error;
            }
        },
    );
};
