import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import SQL from '@nearform/sql';
import crypto from 'crypto';
import createError from 'http-errors';

const PollRequest = Type.Object({
    choices: Type.Array(Type.String()),
    pollName: Type.String(),
    maxParticipants: Type.Optional(Type.Number()),
});

export type PollRequest = Static<typeof PollRequest>;

const PollResponse = Type.Object({
    pollName: Type.String(),
    creatorToken: Type.String(),
    choices: Type.Array(Type.String()),
    maxParticipants: Type.Number(),
    id: Type.String(),
    createdAt: Type.String(),
});

export type PollResponse = Static<typeof PollResponse>;

const schema = {
    body: PollRequest,
    response: {
        200: PollResponse,
    },
};
const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/create',
        { schema },
        async (
            req: FastifyRequest<{ Body: PollRequest }>,
        ): Promise<PollResponse> => {
            const { choices, pollName, maxParticipants = 100 } = req.body;
            const db = await fastify.pg.connect();

            const sqlFindExisting = SQL`
                SELECT id, poll_name
                FROM polls
                WHERE poll_name = ${pollName}`;
            const { rows: polls } = await fastify.pg.query(sqlFindExisting);
            if (polls.length) {
                throw createError(400, 'Poll with that name already exists');
            }
            const creatorToken = crypto.randomBytes(32).toString('hex');

            const sqlInsertPoll = SQL`
                INSERT into polls (poll_name, creator_token, max_participants)
                VALUES (${pollName}, ${creatorToken}, ${maxParticipants})
                RETURNING *
                `;
            const { rows: createdPolls } = await fastify.pg.query<
                PollResponse & { created_at: string }
            >(sqlInsertPoll);
            const { id, created_at: createdAt } = createdPolls[0];

            const sqlInsertChoices = SQL`
                INSERT into choices (choice_name, poll_id)
                VALUES ${SQL.glue(
                    choices.map((choice) => SQL`(${choice},${id})`),
                    ',',
                )}`;
            await fastify.pg.query(sqlInsertChoices);

            db.release();

            return {
                pollName,
                creatorToken,
                choices,
                maxParticipants,
                id,
                createdAt,
            };
        },
    );
};

export default vote;
