import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { and, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import { polls } from '../db/schema';

const DeletePollParams = Type.Object({
    pollId: Type.String(),
});

export type DeletePollParams = Static<typeof DeletePollParams>;

const DeletePollBody = Type.Object({
    creatorToken: Type.String(),
});

export type DeletePollBody = Static<typeof DeletePollBody>;

const schema = {
    params: DeletePollParams,
    body: DeletePollBody,
};

export type DeletePollResponse = {
    message: string;
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
                    throw createError(400, 'Invalid poll ID');
                }

                const [poll] = await fastify.db
                    .select({
                        id: polls.id,
                    })
                    .from(polls)
                    .where(
                        and(
                            eq(polls.id, pollId),
                            eq(polls.creatorToken, creatorToken),
                        ),
                    );
                if (!poll) {
                    throw createError(
                        404,
                        'Poll not found or unauthorized access.',
                    );
                }

                await fastify.db.delete(polls).where(eq(polls.id, pollId));

                return { message: 'Poll deleted successfully' };
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};
