import sql from '@nearform/sql';
import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    ClosePollRequest as ClosePollRequestContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { canClose } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import { withTransaction } from '../utils/db';

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
                    const pollQuery = sql`
                        SELECT id, is_open
                        FROM polls
                        WHERE id = ${pollId} AND creator_token = ${creatorToken}
                        FOR UPDATE
                    `;
                    const { rows } = await client.query<{
                        id: string;
                        is_open: boolean;
                    }>(pollQuery);

                    const poll = rows[0];
                    if (!poll) {
                        throw createError(
                            404,
                            'Poll not found or unauthorized access.',
                        );
                    }

                    if (!poll.is_open) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.pollAlreadyClosed,
                        );
                    }

                    const voterCountQuery = sql`
                        SELECT COUNT(*) AS voter_count
                        FROM voters
                        WHERE poll_id = ${pollId}
                    `;
                    const { rows: voterCounts } = await client.query<{
                        voter_count: string;
                    }>(voterCountQuery);

                    const voterCount = Number(voterCounts[0].voter_count);

                    if (
                        !canClose({
                            isOpen: poll.is_open,
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

                    const closePollQuery = sql`
                        UPDATE polls
                        SET is_open = false
                        WHERE id = ${pollId}
                    `;
                    await client.query(closePollQuery);

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
