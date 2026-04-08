import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    DecryptionSharesRequest as DecryptionSharesRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import {
    computePublishedResultScores,
    canSubmitDecryptionShares,
    decryptTalliesToStrings,
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
import { countPollVoters } from '../utils/pollCounts.js';
import { lockPollById } from '../utils/pollLocks.js';
import {
    getExistingDecryptionShares,
    getExistingDecryptionSharesReadOnly,
    getOrderedPollDecryptionShares,
} from '../utils/pollSubmissions.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { authenticateVoter } from '../utils/voterAuth.js';
import {
    recoverDuplicateVoterSubmission,
    resolveExistingVoterSubmission,
} from '../utils/voterSubmission.js';

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
            const successResponse = {
                message: 'Decryption shares submitted successfully.',
            } satisfies DecryptionSharesResponse;
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
                    const replayedSubmission = resolveExistingVoterSubmission({
                        existingSubmission: existingShares,
                        incomingValue: shares,
                        isEquivalent: (
                            { shares: existingSharesValue },
                            nextShares,
                        ) =>
                            areStringArraysEqual(
                                existingSharesValue,
                                nextShares,
                            ),
                        conflictMessage:
                            ERROR_MESSAGES.decryptionSharesConflict,
                        successResponse,
                    });

                    if (replayedSubmission) {
                        return replayedSubmission;
                    }

                    if (
                        !canSubmitDecryptionShares({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount: votersCount,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultScoreCount: poll.resultScores.length,
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
                        const resultTallies = decryptTalliesToStrings(
                            poll.encryptedTallies,
                            decryptionShareRows.map(
                                ({ shares: voterShares }) => voterShares,
                            ),
                        );
                        const resultScores = computePublishedResultScores(
                            resultTallies,
                            votersCount,
                        );
                        await tx
                            .update(polls)
                            .set({ resultTallies, resultScores })
                            .where(eq(polls.id, pollId));
                    }

                    return successResponse;
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
                    const response = await recoverDuplicateVoterSubmission({
                        db: fastify.db,
                        pollId: req.params.pollId,
                        voterToken: req.body.voterToken,
                        incomingValue: req.body.decryptionShares,
                        loadExistingSubmission: async ({
                            db,
                            pollId,
                            voterId,
                        }) =>
                            await getExistingDecryptionSharesReadOnly(
                                db,
                                pollId,
                                voterId,
                            ),
                        isEquivalent: (
                            { shares: existingSharesValue },
                            nextShares,
                        ) =>
                            areStringArraysEqual(
                                existingSharesValue,
                                nextShares,
                            ),
                        conflictMessage:
                            ERROR_MESSAGES.decryptionSharesConflict,
                        successResponse,
                    });

                    void reply.code(201);
                    void maybeDropTestResponseAfterCommit({
                        reply,
                        request: req,
                    });
                    return response;
                }

                throw error;
            }
        },
    );
};
