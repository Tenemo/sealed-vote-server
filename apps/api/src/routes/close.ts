import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    ClosePollRequest as ClosePollRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { canClose } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { polls } from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import {
    countPollVoters,
    lockPollByIdForCreatorAction,
} from '../utils/polls.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const ClosePollBodySchema = Type.Object({
    creatorToken: SecureTokenSchema,
});

const schema = {
    params: PollIdParamsSchema,
    body: ClosePollBodySchema,
    response: {
        200: MessageResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

export type ClosePollBody = ClosePollRequestContract;
export type ClosePollResponse = MessageResponse;

export const close = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/close',
        { schema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Body: ClosePollBody;
            }>,
            reply: FastifyReply,
        ): Promise<ClosePollResponse> => {
            const { pollId } = req.params;
            const { creatorToken } = req.body;

            const response = await withTransaction(fastify, async (client) => {
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

                const voterCount = await countPollVoters(client, pollId);

                if (!poll.isOpen) {
                    return { message: 'Poll closed successfully' };
                }

                if (
                    !canClose({
                        isOpen: poll.isOpen,
                        commonPublicKey: null,
                        voterCount,
                        encryptedVoteCount: 0,
                        encryptedTallyCount: 0,
                        resultScoreCount: 0,
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

            void maybeDropTestResponseAfterCommit({
                reply,
                request: req,
            });

            return response;
        },
    );
};
