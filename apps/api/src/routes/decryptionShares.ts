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
import { areStringArraysEqual } from '../utils/idempotency.js';
import { countPollVoters } from '../utils/pollCounts.js';
import { executeVoterPhaseSubmission } from '../utils/pollPhaseSubmission.js';
import {
    getExistingPollSubmissionValue,
    getOrderedPollSubmissionValues,
} from '../utils/pollSubmissions.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';

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

type DecryptionSharesRequest = DecryptionSharesRequestContract;
type DecryptionSharesResponse = MessageResponse;

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
            const { pollId } = req.params;
            const { decryptionShares: shares, voterToken } = req.body;
            const response = await executeVoterPhaseSubmission<
                DecryptionSharesRequest['decryptionShares'],
                typeof decryptionSharesTable.$inferSelect.shares,
                DecryptionSharesResponse,
                {
                    voterCount: number;
                }
            >({
                conflictMessage: ERROR_MESSAGES.decryptionSharesConflict,
                fastify,
                incomingValue: shares,
                isEquivalent: (existingShares, nextShares) =>
                    areStringArraysEqual(existingShares, nextShares),
                loadExtra: async ({ tx, pollId: currentPollId }) => ({
                    voterCount: await countPollVoters(tx, currentPollId),
                }),
                loadExistingSubmission: async ({
                    db,
                    pollId: currentPollId,
                    shouldLock,
                    voterId,
                }) =>
                    await getExistingPollSubmissionValue<
                        typeof decryptionSharesTable.$inferSelect.shares
                    >({
                        db,
                        pollId: currentPollId,
                        shouldLock,
                        table: decryptionSharesTable,
                        valueColumn: decryptionSharesTable.shares,
                        voterId,
                    }),
                pollId,
                run: async ({
                    extra: { voterCount },
                    incomingValue,
                    poll,
                    pollId: currentPollId,
                    tx,
                    voter,
                }) => {
                    await tx.insert(decryptionSharesTable).values({
                        pollId: currentPollId,
                        voterId: voter.id,
                        shares: incomingValue,
                    });

                    const sharesByVoter = await getOrderedPollSubmissionValues<
                        typeof decryptionSharesTable.$inferSelect.shares
                    >({
                        db: tx,
                        pollId: currentPollId,
                        table: decryptionSharesTable,
                        valueColumn: decryptionSharesTable.shares,
                    });

                    if (sharesByVoter.length === voterCount) {
                        const resultTallies = decryptTalliesToStrings(
                            poll.encryptedTallies,
                            sharesByVoter,
                        );
                        const resultScores = computePublishedResultScores(
                            resultTallies,
                            voterCount,
                        );

                        await tx
                            .update(polls)
                            .set({ resultTallies, resultScores })
                            .where(eq(polls.id, currentPollId));
                    }
                },
                successResponse,
                uniqueConstraintName: 'unique_decryption_shares_per_voter',
                validate: ({ extra: { voterCount }, incomingValue, poll }) => {
                    if (
                        !canSubmitDecryptionShares({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount,
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

                    if (incomingValue.length === poll.encryptedTallies.length) {
                        return;
                    }

                    throw createError(
                        400,
                        ERROR_MESSAGES.decryptionVectorLengthMismatch,
                    );
                },
                voterToken,
            });

            void reply.code(201);
            void maybeDropTestResponseAfterCommit({
                reply,
                request: req,
            });
            return response;
        },
    );
};
