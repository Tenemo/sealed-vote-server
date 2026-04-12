import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    MessageResponse,
    RestartCeremonyRequest as RestartCeremonyRequestContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { withTransaction } from '../utils/db.js';
import { lockPollByIdForCreatorAction } from '../utils/pollLocks.js';
import { insertPollCeremonySession } from '../utils/pollCeremonySessions.js';
import { minimumPollParticipantsToClose } from '../utils/pollLimits.js';
import { getPollFetchReadModel } from '../utils/pollReadModel.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

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
            req: FastifyRequest<{
                Body: RestartCeremonyBody;
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<RestartCeremonyResponse> => {
            const response = await withTransaction(
                fastify,
                async (tx): Promise<RestartCeremonyResponse> => {
                    const poll = await lockPollByIdForCreatorAction(
                        tx,
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

                    if (poll.isOpen) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartUnavailable,
                        );
                    }

                    const pollReadModel = await getPollFetchReadModel(
                        tx,
                        poll.id,
                    );

                    if (!pollReadModel) {
                        throw createError(
                            404,
                            `Poll with ID ${req.params.pollId} does not exist.`,
                        );
                    }

                    if (pollReadModel.phase !== 'securing') {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartUnavailable,
                        );
                    }

                    const blockingParticipantIndices =
                        pollReadModel.ceremony.blockingParticipantIndices;

                    if (blockingParticipantIndices.length === 0) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartNoBlockers,
                        );
                    }

                    const blockingParticipantSet = new Set(
                        blockingParticipantIndices,
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
                        minimumPollParticipantsToClose
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.ceremonyRestartMinimumParticipants,
                        );
                    }

                    await insertPollCeremonySession({
                        activeParticipantIndices: nextActiveParticipantIndices,
                        pollId: poll.id,
                        tx,
                    });

                    return {
                        message: 'Ceremony restarted successfully.',
                    };
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
