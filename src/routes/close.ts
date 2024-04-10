import sql from '@nearform/sql';
import { Type, Static } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';

const ClosePollParams = Type.Object({
    pollId: Type.String(),
});

export type ClosePollParams = Static<typeof ClosePollParams>;

const ClosePollBody = Type.Object({
    creatorToken: Type.String(),
});

export type ClosePollBody = Static<typeof ClosePollBody>;

const schema = {
    params: ClosePollParams,
    body: ClosePollBody,
};

export type ClosePollResponse = {
    message: string;
};

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

                const sqlVerifyPollAndCountVoters = sql`
                SELECT polls.id, COUNT(voters.id) AS voter_count
                FROM polls
                LEFT JOIN voters ON polls.id = voters.poll_id
                WHERE polls.id = ${pollId} AND polls.creator_token = ${creatorToken}
                GROUP BY polls.id
            `;
                const { rows } = await fastify.pg.query<{
                    id: string;
                    voter_count: number;
                }>(sqlVerifyPollAndCountVoters);

                if (rows.length === 0 || rows[0].voter_count <= 1) {
                    throw createError(
                        400,
                        'Not enough voters to close the poll.',
                    );
                }

                const sqlClosePoll = sql`
                UPDATE polls SET is_open = false
                WHERE id = ${pollId}
            `;
                await fastify.pg.query(sqlClosePoll);

                return { message: 'Poll closed successfully' };
            } catch (error) {
                if (!(error instanceof createError.HttpError))
                    console.error(error);
                throw error;
            }
        },
    );
};
