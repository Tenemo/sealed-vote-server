import {
    ERROR_MESSAGES,
    minimumPollVotersToClose,
} from '@sealed-vote/contracts';
import type {
    MessageResponse,
    RestartCeremonyRequest as RestartCeremonyRequestContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { withTransaction } from '../utils/database.js';
import { lockPollById } from '../utils/poll-locks.js';
import { insertPollCeremonySession } from '../utils/poll-ceremony-sessions.js';
import { getPollFetchReadModel } from '../utils/poll-read-model.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voter-auth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const RestartCeremonyBodySchema = Type.Object({
    creatorToken: SecureTokenSchema,
});

const schema = {
    params: PollIdParamsSchema,
    body: RestartCeremonyBodySchema,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

type RestartCeremonyBody = RestartCeremonyRequestContract;
type RestartCeremonyResponse = MessageResponse;

export const restartCeremony = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/restart-ceremony',
        { schema },
        async (
            request: FastifyRequest<{
                Body: RestartCeremonyBody;
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<RestartCeremonyResponse> => {
            const response = await withTransaction(
                fastify,
                async (
                    databaseTransaction,
                ): Promise<RestartCeremonyResponse> => {
                    const poll = await lockPollById(
                        databaseTransaction,
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

                    if (poll.isOpen) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartUnavailable,
                        );
                    }

                    const pollReadModel = await getPollFetchReadModel(
                        databaseTransaction,
                        poll.id,
                    );

                    if (!pollReadModel) {
                        throw createError(
                            404,
                            `Poll with ID ${request.params.pollId} does not exist.`,
                        );
                    }

                    if (pollReadModel.phase !== 'securing') {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartUnavailable,
                        );
                    }

                    const blockingVoterIndices =
                        pollReadModel.ceremony.blockingVoterIndices;

                    if (blockingVoterIndices.length === 0) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartNoBlockers,
                        );
                    }

                    const blockingParticipantSet = new Set(
                        blockingVoterIndices,
                    );
                    const nextActiveParticipantIndices = pollReadModel.voters
                        .filter(
                            (participant) =>
                                participant.ceremonyState !== 'skipped' &&
                                !blockingParticipantSet.has(
                                    participant.voterIndex,
                                ),
                        )
                        .map((participant) => participant.voterIndex);

                    if (
                        nextActiveParticipantIndices.length <
                        minimumPollVotersToClose
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartMinimumParticipants,
                        );
                    }

                    await insertPollCeremonySession({
                        activeParticipantIndices: nextActiveParticipantIndices,
                        pollId: poll.id,
                        databaseTransaction,
                    });

                    return {
                        message: 'Ceremony restarted successfully.',
                    };
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
