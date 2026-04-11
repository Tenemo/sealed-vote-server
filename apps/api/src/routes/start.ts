import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    StartVotingRequest as StartVotingRequestContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import { defaultMinimumPublishedVoterCount } from 'threshold-elgamal/protocol';

import type { DatabaseTransaction } from '../db/client.js';
import { polls, publicKeyShares, voters } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import { countPollVoters } from '../utils/pollCounts.js';
import { lockPollByIdForCreatorAction } from '../utils/pollLocks.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const StartVotingBodySchema = Type.Object({
    creatorToken: SecureTokenSchema,
    thresholdPercent: Type.Number({
        exclusiveMaximum: 100,
        exclusiveMinimum: 0,
    }),
});

const schema = {
    params: PollIdParamsSchema,
    body: StartVotingBodySchema,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

type StartVotingBody = StartVotingRequestContract;
export type StartVotingResponse = MessageResponse;

const minimumParticipantCount = 3;

const resolveStrictMajorityThreshold = (
    participantCount: number,
    thresholdPercent: number,
): number => {
    const strictMajorityFloor = Math.floor(participantCount / 2) + 1;
    const resolvedThreshold = Math.ceil(
        (thresholdPercent / 100) * participantCount,
    );

    return Math.min(
        participantCount - 1,
        Math.max(strictMajorityFloor, resolvedThreshold),
    );
};

const validateParticipantDeviceReadiness = async (
    client: DatabaseTransaction,
    pollId: string,
): Promise<void> => {
    const joinedParticipants = await client
        .select({
            voterId: voters.id,
            publicKeyShare: publicKeyShares.publicKeyShare,
        })
        .from(voters)
        .leftJoin(publicKeyShares, eq(publicKeyShares.voterId, voters.id))
        .where(eq(voters.pollId, pollId));

    const everyParticipantHasDeviceKeys = joinedParticipants.every(
        (participant) =>
            typeof participant.publicKeyShare === 'string' &&
            participant.publicKeyShare.length > 0,
    );

    if (!everyParticipantHasDeviceKeys) {
        throw createError(400, ERROR_MESSAGES.participantDeviceKeysRequired);
    }
};

const registerStartRoute = (
    fastify: FastifyInstance,
    path: '/polls/:pollId/start' | '/polls/:pollId/close',
): void => {
    fastify.post(
        path,
        { schema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Body: StartVotingBody;
            }>,
            reply: FastifyReply,
        ): Promise<StartVotingResponse> => {
            const { pollId } = req.params;
            const { creatorToken, thresholdPercent } = req.body;

            const response = await withTransaction(
                fastify,
                async (client): Promise<StartVotingResponse> => {
                    const poll = await lockPollByIdForCreatorAction(
                        client,
                        pollId,
                    );

                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (
                        poll.creatorTokenHash !== hashSecureToken(creatorToken)
                    ) {
                        throw createError(
                            403,
                            ERROR_MESSAGES.invalidCreatorToken,
                        );
                    }

                    if (!poll.isOpen) {
                        return { message: 'Voting started successfully' };
                    }

                    const participantCount = await countPollVoters(
                        client,
                        pollId,
                    );

                    if (participantCount < minimumParticipantCount) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.notEnoughParticipantsToStart,
                        );
                    }

                    await validateParticipantDeviceReadiness(client, pollId);

                    const reconstructionThreshold =
                        resolveStrictMajorityThreshold(
                            participantCount,
                            thresholdPercent,
                        );
                    const minimumPublishedVoterCount =
                        defaultMinimumPublishedVoterCount(
                            reconstructionThreshold,
                            participantCount,
                        );

                    await client
                        .update(polls)
                        .set({
                            isOpen: false,
                            requestedMinimumPublishedVoterCount:
                                minimumPublishedVoterCount,
                            requestedReconstructionThreshold:
                                reconstructionThreshold,
                        })
                        .where(eq(polls.id, pollId));

                    return { message: 'Voting started successfully' };
                },
            );

            void maybeDropTestResponseAfterCommit({
                reply,
                request: req,
            });

            return response;
        },
    );
};

export const start = async (fastify: FastifyInstance): Promise<void> => {
    registerStartRoute(fastify, '/polls/:pollId/start');
    registerStartRoute(fastify, '/polls/:pollId/close');
};
