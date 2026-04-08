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
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import {
    decryptionShares as decryptionSharesTable,
    polls,
} from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { areStringArraysEqual } from '../utils/idempotency.js';
import {
    countPollVoters,
    getExistingDecryptionShares,
    getOrderedPollDecryptionShares,
    lockPollById,
} from '../utils/polls.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { authenticateVoter, hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const DecryptionSharesRequestSchema = Type.Object({
    decryptionShares: Type.Array(Type.String()),
    voterToken: SecureTokenSchema,
});

const schema = {
    params: PollIdParamsSchema,
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
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<DecryptionSharesResponse> => {
            try {
                const { pollId } = req.params;
                const { decryptionShares: shares, voterToken } = req.body;

                const response = await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    const votersCount = await countPollVoters(tx, pollId);
                    const voter = await authenticateVoter(
                        tx,
                        pollId,
                        voterToken,
                    );

                    const existingShares = await getExistingDecryptionShares(
                        tx,
                        pollId,
                        voter.id,
                    );

                    if (existingShares) {
                        if (
                            !areStringArraysEqual(existingShares.shares, shares)
                        ) {
                            throw createError(
                                409,
                                ERROR_MESSAGES.decryptionSharesConflict,
                            );
                        }

                        return {
                            message:
                                'Decryption shares submitted successfully.',
                        };
                    }

                    if (
                        !canSubmitDecryptionShares({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount: votersCount,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultCount: poll.results.length,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.decryptionPhaseClosed,
                        );
                    }

                    if (shares.length !== poll.encryptedTallies.length) {
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

                    const decryptionShareRows =
                        await getOrderedPollDecryptionShares(tx, pollId);

                    if (decryptionShareRows.length === votersCount) {
                        const results = decryptTallies(
                            poll.encryptedTallies,
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
                void maybeDropTestResponseAfterCommit({
                    reply,
                    request: req,
                });
                return response;
            } catch (error) {
                if (
                    isConstraintViolation(
                        error,
                        'unique_decryption_shares_per_voter',
                    )
                ) {
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

                    const existingShares =
                        voter &&
                        (await fastify.db.query.decryptionShares.findFirst({
                            where: (fields, { and, eq: isEqual }) =>
                                and(
                                    isEqual(fields.pollId, req.params.pollId),
                                    isEqual(fields.voterId, voter.id),
                                ),
                            columns: {
                                shares: true,
                            },
                        }));

                    if (
                        existingShares &&
                        areStringArraysEqual(
                            existingShares.shares,
                            req.body.decryptionShares,
                        )
                    ) {
                        void reply.code(201);
                        void maybeDropTestResponseAfterCommit({
                            reply,
                            request: req,
                        });
                        return {
                            message:
                                'Decryption shares submitted successfully.',
                        };
                    }

                    throw createError(
                        409,
                        ERROR_MESSAGES.decryptionSharesConflict,
                    );
                }

                throw error;
            }
        },
    );
};
