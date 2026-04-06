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

import { uuidRegex } from '../constants.js';
import {
    decryptionShares as decryptionSharesTable,
    polls,
} from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import {
    countPollVoters,
    getOrderedPollDecryptionShares,
    lockPollById,
} from '../utils/polls.js';
import { authenticateVoter } from '../utils/voterAuth.js';

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
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    const votersCount = await countPollVoters(tx, pollId);

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

                    const voter = await authenticateVoter(
                        tx,
                        pollId,
                        voterToken,
                    );

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
