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

type PublicKeyShareRequest = PublicKeyShareRequestContract;
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
            const { publicKeyShare: share, voterToken } = req.body;
            const { pollId } = req.params;
            const successResponse = {
                message: 'Public key share submitted successfully',
            } satisfies PublicKeyShareResponse;
            const response = await executeVoterPhaseSubmission({
                conflictMessage: ERROR_MESSAGES.publicKeyConflict,
                fastify,
                incomingValue: share,
                isEquivalent: (existingPublicKeyShare, nextPublicKeyShare) =>
                    existingPublicKeyShare === nextPublicKeyShare,
                loadExtra: async ({ tx, pollId: currentPollId }) => ({
                    voterCount: await countPollVoters(tx, currentPollId),
                }),
                loadExistingSubmission: async ({
                    db,
                    pollId: currentPollId,
                    shouldLock,
                    voterId,
                }) =>
                    await getExistingPollSubmissionValue<string>({
                        db,
                        pollId: currentPollId,
                        shouldLock,
                        table: publicKeyShares,
                        valueColumn: publicKeyShares.publicKeyShare,
                        voterId,
                    }),
                missingSubmissionConflictMessage:
                    ERROR_MESSAGES.publicKeyAlreadySubmitted,
                pollId,
                run: async ({
                    extra: { voterCount },
                    incomingValue,
                    pollId: currentPollId,
                    tx,
                    voter,
                }) => {
                    await tx.insert(publicKeyShares).values({
                        pollId: currentPollId,
                        voterId: voter.id,
                        publicKeyShare: incomingValue,
                    });

                    const publicKeySharesByVoter =
                        await getOrderedPollSubmissionValues<string>({
                            db: tx,
                            pollId: currentPollId,
                            table: publicKeyShares,
                            valueColumn: publicKeyShares.publicKeyShare,
                        });

                    if (publicKeySharesByVoter.length === voterCount) {
                        const combinedPublicKey = combinePublicKeys(
                            publicKeySharesByVoter.map((keyShare) =>
                                BigInt(keyShare),
                            ),
                        );

                        await tx
                            .update(polls)
                            .set({
                                commonPublicKey: combinedPublicKey.toString(),
                            })
                            .where(eq(polls.id, currentPollId));
                    }
                },
                successResponse,
                uniqueConstraintName: 'unique_public_key_share_per_voter',
                validate: ({ extra: { voterCount }, poll }) => {
                    if (
                        canSubmitPublicKeyShare({
                            isOpen: poll.isOpen,
                            commonPublicKey: poll.commonPublicKey,
                            voterCount,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: poll.encryptedTallies.length,
                            resultScoreCount: poll.resultScores.length,
                        })
                    ) {
                        return;
                    }

                    throw createError(400, ERROR_MESSAGES.publicKeyPhaseClosed);
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
