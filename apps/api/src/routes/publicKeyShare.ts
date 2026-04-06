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

import { uuidRegex } from '../constants.js';
import { polls, publicKeyShares } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import {
    countPollVoters,
    getOrderedPollPublicKeyShares,
    lockPollById,
} from '../utils/polls.js';
import { authenticateVoter } from '../utils/voterAuth.js';

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

                const response = await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    const voterCount = await countPollVoters(tx, pollId);

                    if (
                        !canSubmitPublicKeyShare({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultCount: poll.results.length,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.publicKeyPhaseClosed,
                        );
                    }

                    const voter = await authenticateVoter(
                        tx,
                        pollId,
                        voterToken,
                    );

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
