import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../../constants';

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
            const { pollId } = req.params;
            const { creatorToken } = req.body;
            if (!uuidRegex.test(pollId)) {
                throw createError(400, 'Invalid poll ID');
            }

            const sqlVerifyPoll = sql`
            SELECT id FROM polls
            WHERE id = ${pollId} AND creator_token = ${creatorToken}
        `;
            const { rowCount: pollExists } =
                await fastify.pg.query(sqlVerifyPoll);
            if (!pollExists) {
                throw createError(
                    404,
                    'Poll not found or unauthorized access.',
                );
            }

            const sqlDeletePoll = sql`
            DELETE FROM polls WHERE id = ${pollId}
        `;
            await fastify.pg.query(sqlDeletePoll);

            return { message: 'Poll deleted successfully' };
        },
    );
};
