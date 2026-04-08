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
import {
    countPollVoters,
    getExistingPublicKeyShare,
    getOrderedPollPublicKeyShares,
    lockPollById,
} from '../utils/polls.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import {
    authenticateVoter,
    findVoterByTokenReadOnly,
} from '../utils/voterAuth.js';

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

                    if (existingShare) {
                        if (existingShare.publicKeyShare !== share) {
                            throw createError(
                                409,
                                ERROR_MESSAGES.publicKeyConflict,
                            );
                        }

                        return {
                            message: 'Public key share submitted successfully',
                        };
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

                    return {
                        message: 'Public key share submitted successfully',
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
                        'unique_public_key_share_per_voter',
                    )
                ) {
                    const voter = await findVoterByTokenReadOnly(
                        fastify.db,
                        req.params.pollId,
                        req.body.voterToken,
                    );

                    if (!voter) {
                        throw createError(
                            409,
                            ERROR_MESSAGES.publicKeyAlreadySubmitted,
                        );
                    }

                    const existingShare =
                        await fastify.db.query.publicKeyShares.findFirst({
                            where: (fields, { and, eq: isEqual }) =>
                                and(
                                    isEqual(fields.pollId, req.params.pollId),
                                    isEqual(fields.voterId, voter.id),
                                ),
                            columns: {
                                publicKeyShare: true,
                            },
                        });

                    if (
                        existingShare?.publicKeyShare ===
                        req.body.publicKeyShare
                    ) {
                        void reply.code(201);
                        void maybeDropTestResponseAfterCommit({
                            reply,
                            request: req,
                        });
                        return {
                            message: 'Public key share submitted successfully',
                        };
                    }

                    throw createError(409, ERROR_MESSAGES.publicKeyConflict);
                }

                throw error;
            }
        },
    );
};
