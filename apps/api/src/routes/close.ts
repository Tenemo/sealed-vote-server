import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    CloseVotingRequest as CloseVotingRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { and, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import type { DatabaseTransaction } from '../db/client.js';
import { polls, publicKeyShares, voters } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import { parseParticipantDeviceRecord } from '../utils/participantDevices.js';
import { insertPollCeremonySession } from '../utils/pollCeremonySessions.js';
import { countPollVoters } from '../utils/pollCounts.js';
import { lockPollByIdForCreatorAction } from '../utils/pollLocks.js';
import { minimumPollParticipantsToClose } from '../utils/pollLimits.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const CloseVotingBodySchema = Type.Object({
    creatorToken: SecureTokenSchema,
});

const schema = {
    params: PollIdParamsSchema,
    body: CloseVotingBodySchema,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

type CloseVotingBody = CloseVotingRequestContract;
export type CloseVotingResponse = MessageResponse;

const validateParticipantDeviceReadiness = async (
    client: DatabaseTransaction,
    pollId: string,
): Promise<void> => {
    const submittedParticipants = await client
        .select({
            publicKeyShare: publicKeyShares.publicKeyShare,
            voterId: voters.id,
        })
        .from(voters)
        .leftJoin(
            publicKeyShares,
            and(
                eq(publicKeyShares.voterId, voters.id),
                eq(publicKeyShares.pollId, voters.pollId),
            ),
        )
        .where(eq(voters.pollId, pollId));

    const everyParticipantHasDeviceKeys = submittedParticipants.every(
        (participant) =>
            parseParticipantDeviceRecord(participant.publicKeyShare) !== null,
    );

    if (!everyParticipantHasDeviceKeys) {
        throw createError(400, ERROR_MESSAGES.participantDeviceKeysRequired);
    }
};

export const closeVoting = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/close',
        { schema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Body: CloseVotingBody;
            }>,
            reply: FastifyReply,
        ): Promise<CloseVotingResponse> => {
            const response = await withTransaction(
                fastify,
                async (client): Promise<CloseVotingResponse> => {
                    const poll = await lockPollByIdForCreatorAction(
                        client,
                        req.params.pollId,
                    );

                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${req.params.pollId} does not exist.`,
                        );
                    }

                    if (
                        poll.creatorTokenHash !==
                        hashSecureToken(req.body.creatorToken)
                    ) {
                        throw createError(
                            403,
                            ERROR_MESSAGES.invalidCreatorToken,
                        );
                    }

                    if (!poll.isOpen) {
                        return { message: 'Voting closed successfully.' };
                    }

                    const participantCount = await countPollVoters(
                        client,
                        req.params.pollId,
                    );

                    if (participantCount < minimumPollParticipantsToClose) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.notEnoughParticipantsToClose,
                        );
                    }

                    await validateParticipantDeviceReadiness(
                        client,
                        req.params.pollId,
                    );

                    const submittedVoters = await client.query.voters.findMany({
                        where: (fields, { eq: isEqual }) =>
                            isEqual(fields.pollId, req.params.pollId),
                        columns: {
                            voterIndex: true,
                        },
                        orderBy: (fields, { asc: ascending }) =>
                            ascending(fields.voterIndex),
                    });

                    await client
                        .update(polls)
                        .set({
                            isOpen: false,
                        })
                        .where(eq(polls.id, req.params.pollId));

                    await insertPollCeremonySession({
                        activeParticipantIndices: submittedVoters.map(
                            (participant) => participant.voterIndex,
                        ),
                        pollId: req.params.pollId,
                        tx: client,
                    });

                    return { message: 'Voting closed successfully.' };
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
