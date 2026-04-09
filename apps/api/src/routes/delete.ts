import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { polls } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import { lockPollByIdForCreatorAction } from '../utils/pollLocks.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const DeletePollBody = Type.Object({
    creatorToken: SecureTokenSchema,
});

export type DeletePollBody = Static<typeof DeletePollBody>;

const schema = {
    params: PollIdParamsSchema,
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
                Params: PollIdParams;
                Body: DeletePollBody;
            }>,
        ) => {
            const { pollId } = req.params;
            const { creatorToken } = req.body;

            return await withTransaction(fastify, async (tx) => {
                const poll = await lockPollByIdForCreatorAction(tx, pollId);
                if (!poll) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                if (poll.creatorTokenHash !== hashSecureToken(creatorToken)) {
                    throw createError(403, ERROR_MESSAGES.invalidCreatorToken);
                }

                await tx.delete(polls).where(eq(polls.id, pollId));

                return { message: 'Poll deleted successfully' };
            });
        },
    );
};
