import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    ClosePollRequest as ClosePollRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { canClose } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants.js';
import { polls } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import {
    countPollVoters,
    lockPollByIdForCreatorAction,
} from '../utils/polls.js';
import { hashSecureToken } from '../utils/voterAuth.js';

const ClosePollParamsSchema = Type.Object({
    pollId: Type.String(),
});

const ClosePollBodySchema = Type.Object({
    creatorToken: Type.String(),
});

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
    params: ClosePollParamsSchema,
    body: ClosePollBodySchema,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

export type ClosePollParams = {
    pollId: string;
};
export type ClosePollBody = ClosePollRequestContract;
export type ClosePollResponse = MessageResponse;

export const close = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/close',
        { schema },
        async (
            req: FastifyRequest<{
                Params: ClosePollParams;
                Body: ClosePollBody;
            }>,
        ): Promise<ClosePollResponse> => {
            try {
                const { pollId } = req.params;
                const { creatorToken } = req.body;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                return await withTransaction(fastify, async (client) => {
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
                        throw createError(
                            400,
                            ERROR_MESSAGES.pollAlreadyClosed,
                        );
                    }

                    const voterCount = await countPollVoters(client, pollId);

                    if (
                        !canClose({
                            isOpen: poll.isOpen,
                            commonPublicKey: null,
                            voterCount,
                            encryptedVoteCount: 0,
                            encryptedTallyCount: 0,
                            resultCount: 0,
                        })
                    ) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.notEnoughVotersToClose,
                        );
                    }

                    await client
                        .update(polls)
                        .set({ isOpen: false })
                        .where(eq(polls.id, pollId));

                    return { message: 'Poll closed successfully' };
                });
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }

                throw error;
            }
        },
    );
};
