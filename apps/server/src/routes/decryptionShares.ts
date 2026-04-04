import sql from '@nearform/sql';
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
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
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

                const response = await withTransaction(
                    fastify,
                    async (client) => {
                        const pollQuery = sql`
                        SELECT
                            is_open,
                            common_public_key,
                            encrypted_tallies,
                            jsonb_array_length(encrypted_tallies) AS encrypted_tally_count,
                            COALESCE(array_length(results, 1), 0) AS result_count
                        FROM polls
                        WHERE id = ${pollId}
                        FOR UPDATE
                    `;
                        const { rows: polls } = await client.query<{
                            is_open: boolean;
                            common_public_key: string | null;
                            encrypted_tallies: { c1: string; c2: string }[];
                            encrypted_tally_count: number;
                            result_count: number;
                        }>(pollQuery);

                        const poll = polls[0];
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
                            client,
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

                        const insertSharesQuery = sql`
                        INSERT INTO decryption_shares (poll_id, voter_id, shares)
                        VALUES (${pollId}, ${voter.id}, ${JSON.stringify(shares)}::jsonb)
                    `;
                        await client.query(insertSharesQuery);

                        const updateVoterQuery = sql`
                        UPDATE voters
                        SET has_submitted_decryption_shares = true
                        WHERE id = ${voter.id}
                    `;
                        await client.query(updateVoterQuery);

                        const allSharesQuery = sql`
                        SELECT decryption_shares.shares
                        FROM decryption_shares
                        INNER JOIN voters ON voters.id = decryption_shares.voter_id
                        WHERE decryption_shares.poll_id = ${pollId}
                        ORDER BY voters.voter_index
                    `;
                        const { rows: decryptionShareRows } =
                            await client.query<{
                                shares: string[];
                            }>(allSharesQuery);

                        const voterCountQuery = sql`
                        SELECT COUNT(*) AS voters_count
                        FROM voters
                        WHERE poll_id = ${pollId}
                    `;
                        const { rows: voterCounts } = await client.query<{
                            voters_count: string;
                        }>(voterCountQuery);
                        const votersCount = Number(voterCounts[0].voters_count);

                        if (decryptionShareRows.length === votersCount) {
                            const results = decryptTallies(
                                poll.encrypted_tallies,
                                decryptionShareRows.map(
                                    ({ shares: voterShares }) => voterShares,
                                ),
                            );
                            const resultItems = sql.glue(
                                results.map((result) => sql`${result}`),
                                ', ',
                            );

                            const updateResultsQuery = sql`
                            UPDATE polls
                            SET results = ARRAY[${resultItems}]::int[]
                            WHERE id = ${pollId}
                        `;
                            await client.query(updateResultsQuery);
                        }

                        return {
                            message:
                                'Decryption shares submitted successfully.',
                        };
                    },
                );

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
