import {
    ERROR_MESSAGES,
    minimumPollVotersToClose,
} from '@sealed-vote/contracts';
import type {
    CloseVotingRequest as CloseVotingRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { and, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import type { DatabaseTransaction } from '../database/client.js';
import { polls, publicKeyShares, voters } from '../database/schema.js';
import { withTransaction } from '../utils/database.js';
import { parseVoterDeviceRecord } from '../utils/voter-device-records.js';
import { insertPollCeremonySession } from '../utils/poll-ceremony-sessions.js';
import { lockPollById } from '../utils/poll-locks.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voter-auth.js';

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
type CloseVotingResponse = MessageResponse;

const validateVoterDeviceReadiness = async (
    client: DatabaseTransaction,
    pollId: string,
): Promise<number[]> => {
    const registeredVoters = await client
        .select({
            publicKeyShare: publicKeyShares.publicKeyShare,
            voterId: voters.id,
            voterIndex: voters.voterIndex,
        })
        .from(voters)
        .leftJoin(
            publicKeyShares,
            and(
                eq(publicKeyShares.voterId, voters.id),
                eq(publicKeyShares.pollId, voters.pollId),
            ),
        )
        .where(eq(voters.pollId, pollId))
        .orderBy(voters.voterIndex);

    if (registeredVoters.length < minimumPollVotersToClose) {
        throw createError(400, ERROR_MESSAGES.notEnoughVotersToClose);
    }

    const everyVoterHasDeviceKeys = registeredVoters.every(
        (voter) => parseVoterDeviceRecord(voter.publicKeyShare) !== null,
    );

    if (!everyVoterHasDeviceKeys) {
        throw createError(400, ERROR_MESSAGES.voterDeviceKeysRequired);
    }

    return registeredVoters.map((voter) => voter.voterIndex);
};

export const closeVoting = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/close',
        { schema },
        async (
            request: FastifyRequest<{
                Params: PollIdParams;
                Body: CloseVotingBody;
            }>,
            reply: FastifyReply,
        ): Promise<CloseVotingResponse> => {
            const response = await withTransaction(
                fastify,
                async (client): Promise<CloseVotingResponse> => {
                    const poll = await lockPollById(
                        client,
                        request.params.pollId,
                    );

                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${request.params.pollId} does not exist.`,
                        );
                    }

                    if (
                        poll.creatorTokenHash !==
                        hashSecureToken(request.body.creatorToken)
                    ) {
                        throw createError(
                            403,
                            ERROR_MESSAGES.invalidCreatorToken,
                        );
                    }

                    if (!poll.isOpen) {
                        return { message: 'Voting closed successfully.' };
                    }

                    const activeParticipantIndices =
                        await validateVoterDeviceReadiness(
                            client,
                            request.params.pollId,
                        );

                    await client
                        .update(polls)
                        .set({
                            isOpen: false,
                        })
                        .where(eq(polls.id, request.params.pollId));

                    await insertPollCeremonySession({
                        activeParticipantIndices,
                        pollId: request.params.pollId,
                        databaseTransaction: client,
                    });

                    return { message: 'Voting closed successfully.' };
                },
            );

            void maybeDropTestResponseAfterCommit({
                reply,
                request: request,
            });

            return response;
        },
    );
};
