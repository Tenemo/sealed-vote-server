import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    StartVotingRequest as StartVotingRequestContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import { defaultMinimumPublishedVoterCount } from 'threshold-elgamal';

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
        maximum: 100,
        exclusiveMinimum: 0,
    }),
});

const CloseVotingBodySchema = Type.Object({
    creatorToken: SecureTokenSchema,
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

const closeSchema = {
    params: PollIdParamsSchema,
    body: CloseVotingBodySchema,
    response: schema.response,
};

type StartVotingBody = StartVotingRequestContract;
type CloseVotingBody = {
    creatorToken: string;
};
export type StartVotingResponse = MessageResponse;

const minimumParticipantCount = 3;

const resolveDistributedThreshold = (
    participantCount: number,
    thresholdPercent: number,
): number => {
    const strictMajorityFloor = Math.floor(participantCount / 2) + 1;
    const resolvedThreshold = Math.ceil(
        (thresholdPercent / 100) * participantCount,
    );

    return Math.min(
        participantCount,
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

const defaultThresholdPercent = 51;

const handleStartVoting = async ({
    creatorToken,
    fastify,
    pollId,
    reply,
    req,
    thresholdPercent,
}: {
    creatorToken: string;
    fastify: FastifyInstance;
    pollId: string;
    reply: FastifyReply;
    req: FastifyRequest;
    thresholdPercent: number;
}): Promise<StartVotingResponse> => {
    const response = await withTransaction(
        fastify,
        async (client): Promise<StartVotingResponse> => {
            const poll = await lockPollByIdForCreatorAction(client, pollId);

            if (!poll) {
                throw createError(
                    404,
                    `Poll with ID ${pollId} does not exist.`,
                );
            }

            if (poll.creatorTokenHash !== hashSecureToken(creatorToken)) {
                throw createError(403, ERROR_MESSAGES.invalidCreatorToken);
            }

            if (!poll.isOpen) {
                return { message: 'Voting started successfully' };
            }

            const participantCount = await countPollVoters(client, pollId);

            if (participantCount < minimumParticipantCount) {
                throw createError(
                    400,
                    ERROR_MESSAGES.notEnoughParticipantsToStart,
                );
            }

            await validateParticipantDeviceReadiness(client, pollId);

            const reconstructionThreshold = resolveDistributedThreshold(
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
                    requestedReconstructionThreshold: reconstructionThreshold,
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
};

const registerStartRoute = (fastify: FastifyInstance): void => {
    fastify.post(
        '/polls/:pollId/start',
        { schema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Body: StartVotingBody;
            }>,
            reply: FastifyReply,
        ): Promise<StartVotingResponse> => {
            return await handleStartVoting({
                creatorToken: req.body.creatorToken,
                fastify,
                pollId: req.params.pollId,
                reply,
                req,
                thresholdPercent: req.body.thresholdPercent,
            });
        },
    );

    fastify.post(
        '/polls/:pollId/close',
        { schema: closeSchema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Body: CloseVotingBody;
            }>,
            reply: FastifyReply,
        ): Promise<StartVotingResponse> =>
            await handleStartVoting({
                creatorToken: req.body.creatorToken,
                fastify,
                pollId: req.params.pollId,
                reply,
                req,
                thresholdPercent: defaultThresholdPercent,
            }),
    );
};

export const start = async (fastify: FastifyInstance): Promise<void> => {
    registerStartRoute(fastify);
};
