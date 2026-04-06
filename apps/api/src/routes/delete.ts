import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants.js';
import { polls } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import { lockPollByIdForCreatorAction } from '../utils/polls.js';
import { hashSecureToken } from '../utils/voterAuth.js';

const DeletePollParams = Type.Object({
    pollId: Type.String(),
});

export type DeletePollParams = Static<typeof DeletePollParams>;

const DeletePollBody = Type.Object({
    creatorToken: Type.String(),
});

export type DeletePollBody = Static<typeof DeletePollBody>;

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
    params: DeletePollParams,
    body: DeletePollBody,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

export const deletePoll = async (fastify: FastifyInstance): Promise<void> => {
    fastify.delete(
        '/polls/:pollId',
        { schema },
        async (
            req: FastifyRequest<{
                Params: DeletePollParams;
                Body: DeletePollBody;
            }>,
        ) => {
            try {
                const { pollId } = req.params;
                const { creatorToken } = req.body;
                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                return await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollByIdForCreatorAction(tx, pollId);
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

                    await tx.delete(polls).where(eq(polls.id, pollId));

                    return { message: 'Poll deleted successfully' };
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
