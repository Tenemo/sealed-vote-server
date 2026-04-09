import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    PublicKeyShareRequest as PublicKeyShareRequestContract,
} from '@sealed-vote/contracts';
import { canSubmitPublicKeyShare } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import { combinePublicKeys } from 'threshold-elgamal';

import { polls, publicKeyShares } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { countPollVoters } from '../utils/pollCounts.js';
import { lockPollById } from '../utils/pollLocks.js';
import {
    getExistingPublicKeyShare,
    getExistingPublicKeyShareReadOnly,
    getOrderedPollPublicKeyShares,
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

const PublicKeyShareRequestSchema = Type.Object({
    publicKeyShare: Type.String(),
    voterToken: SecureTokenSchema,
});

const schema = {
    params: PollIdParamsSchema,
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
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<PublicKeyShareResponse> => {
            try {
                const { publicKeyShare: share, voterToken } = req.body;
                const { pollId } = req.params;
                const successResponse = {
                    message: 'Public key share submitted successfully',
                } satisfies PublicKeyShareResponse;

                const response = await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    const voterCount = await countPollVoters(tx, pollId);
                    const voter = await authenticateVoter(
                        tx,
                        pollId,
                        voterToken,
                    );

                    const existingShare = await getExistingPublicKeyShare(
                        tx,
                        pollId,
                        voter.id,
                    );
                    const replayedSubmission = resolveExistingVoterSubmission({
                        existingSubmission: existingShare,
                        incomingValue: share,
                        isEquivalent: (
                            { publicKeyShare: existingPublicKeyShare },
                            nextPublicKeyShare,
                        ) => existingPublicKeyShare === nextPublicKeyShare,
                        conflictMessage: ERROR_MESSAGES.publicKeyConflict,
                        successResponse,
                    });

                    if (replayedSubmission) {
                        return replayedSubmission;
                    }

                    if (
                        !canSubmitPublicKeyShare({
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
                            ERROR_MESSAGES.publicKeyPhaseClosed,
                        );
                    }

                    await tx.insert(publicKeyShares).values({
                        pollId,
                        voterId: voter.id,
                        publicKeyShare: share,
                    });

                    const publicKeyShareRows =
                        await getOrderedPollPublicKeyShares(tx, pollId);

                    if (publicKeyShareRows.length === voterCount) {
                        const combinedPublicKey = combinePublicKeys(
                            publicKeyShareRows.map(
                                ({ publicKeyShare: keyShare }) =>
                                    BigInt(keyShare),
                            ),
                        );

                        await tx
                            .update(polls)
                            .set({
                                commonPublicKey: combinedPublicKey.toString(),
                            })
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
                        'unique_public_key_share_per_voter',
                    )
                ) {
                    const response = await recoverDuplicateVoterSubmission({
                        db: fastify.db,
                        pollId: req.params.pollId,
                        voterToken: req.body.voterToken,
                        incomingValue: req.body.publicKeyShare,
                        loadExistingSubmission: async ({
                            db,
                            pollId,
                            voterId,
                        }) =>
                            await getExistingPublicKeyShareReadOnly(
                                db,
                                pollId,
                                voterId,
                            ),
                        isEquivalent: (
                            { publicKeyShare: existingPublicKeyShare },
                            nextPublicKeyShare,
                        ) => existingPublicKeyShare === nextPublicKeyShare,
                        conflictMessage: ERROR_MESSAGES.publicKeyConflict,
                        missingSubmissionConflictMessage:
                            ERROR_MESSAGES.publicKeyAlreadySubmitted,
                        successResponse: {
                            message: 'Public key share submitted successfully',
                        } satisfies PublicKeyShareResponse,
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
