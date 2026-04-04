import sql from '@nearform/sql';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import { combinePublicKeys } from 'threshold-elgamal';

import { uuidRegex } from '../constants';
import { isConstraintViolation, withTransaction } from '../utils/db';
import { authenticateVoter } from '../utils/voterAuth';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    PublicKeyShareRequest as PublicKeyShareRequestContract,
} from '@sealed-vote/contracts';

const PublicKeyShareRequestSchema = Type.Object({
    publicKeyShare: Type.String(),
    voterToken: Type.String(),
});

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
    body: PublicKeyShareRequestSchema,
    response: {
        201: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

export type PublicKeyShareRequest = PublicKeyShareRequestContract;
export type PublicKeyShareResponse = MessageResponse;

export const publicKeyShare = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/public-key-share',
        { schema },
        async (
            req: FastifyRequest<{
                Body: PublicKeyShareRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<PublicKeyShareResponse> => {
            try {
                const { publicKeyShare: share, voterToken } = req.body;
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                const response = await withTransaction(
                    fastify,
                    async (client) => {
                        const pollQuery = sql`
                        SELECT
                            id,
                            is_open,
                            common_public_key,
                            results,
                            jsonb_array_length(encrypted_tallies) AS encrypted_tally_count
                        FROM polls
                        WHERE id = ${pollId}
                        FOR UPDATE
                    `;
                        const { rows: polls } = await client.query<{
                            id: string;
                            is_open: boolean;
                            common_public_key: string | null;
                            results: number[];
                            encrypted_tally_count: number;
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
                            poll.common_public_key ||
                            poll.results.length > 0 ||
                            poll.encrypted_tally_count > 0
                        ) {
                            throw createError(
                                400,
                                ERROR_MESSAGES.publicKeyPhaseClosed,
                            );
                        }

                        const voter = await authenticateVoter(
                            client,
                            pollId,
                            voterToken,
                        );
                        if (voter.hasSubmittedPublicKeyShare) {
                            throw createError(
                                409,
                                ERROR_MESSAGES.publicKeyAlreadySubmitted,
                            );
                        }

                        const insertShareQuery = sql`
                        INSERT INTO public_key_shares (poll_id, voter_id, public_key_share)
                        VALUES (${pollId}, ${voter.id}, ${share})
                    `;
                        await client.query(insertShareQuery);

                        const updateVoterQuery = sql`
                        UPDATE voters
                        SET has_submitted_public_key_share = true
                        WHERE id = ${voter.id}
                    `;
                        await client.query(updateVoterQuery);

                        const sharesQuery = sql`
                        SELECT public_key_shares.public_key_share
                        FROM public_key_shares
                        INNER JOIN voters ON voters.id = public_key_shares.voter_id
                        WHERE public_key_shares.poll_id = ${pollId}
                        ORDER BY voters.voter_index
                    `;
                        const { rows: publicKeyShares } = await client.query<{
                            public_key_share: string;
                        }>(sharesQuery);

                        const voterCountQuery = sql`
                        SELECT COUNT(*) AS voters_count
                        FROM voters
                        WHERE poll_id = ${pollId}
                    `;
                        const { rows: voterCounts } = await client.query<{
                            voters_count: string;
                        }>(voterCountQuery);
                        const votersCount = Number(voterCounts[0].voters_count);

                        if (publicKeyShares.length === votersCount) {
                            const combinedPublicKey = combinePublicKeys(
                                publicKeyShares.map(({ public_key_share }) =>
                                    BigInt(public_key_share),
                                ),
                            );

                            const updatePollQuery = sql`
                            UPDATE polls
                            SET common_public_key = ${combinedPublicKey.toString()}
                            WHERE id = ${pollId}
                        `;
                            await client.query(updatePollQuery);
                        }

                        return {
                            message: 'Public key share submitted successfully',
                        };
                    },
                );

                void reply.code(201);
                return response;
            } catch (error) {
                if (
                    isConstraintViolation(
                        error,
                        'unique_public_key_share_per_voter',
                    )
                ) {
                    throw createError(
                        409,
                        ERROR_MESSAGES.publicKeyAlreadySubmitted,
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
