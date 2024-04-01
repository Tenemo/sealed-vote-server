import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import crypto from 'crypto';
import createError from 'http-errors';

const CreatePollRequest = Type.Object({
    choices: Type.Array(Type.String()),
    pollName: Type.String(),
    maxParticipants: Type.Optional(Type.Number()),
});

export type CreatePollRequest = Static<typeof CreatePollRequest>;

const CreatePollResponse = Type.Object({
    pollName: Type.String(),
    creatorToken: Type.String(),
    choices: Type.Array(Type.String()),
    maxParticipants: Type.Number(),
    id: Type.String(),
    createdAt: Type.String(),
});

export type CreatePollResponse = Static<typeof CreatePollResponse>;

const schema = {
    body: CreatePollRequest,
    response: {
        200: CreatePollResponse,
    },
};
const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/create',
        { schema },
        async (
            req: FastifyRequest<{ Body: CreatePollRequest }>,
        ): Promise<CreatePollResponse> => {
            const { choices, pollName, maxParticipants = 100 } = req.body;

            if (choices.length < 2) {
                throw createError(400, 'Not enough choices.');
            }
            const sqlFindExisting = sql`
                SELECT id
                FROM polls
                WHERE poll_name = ${pollName}`;
            const { rows: polls } = await fastify.pg.query(sqlFindExisting);
            if (polls.length) {
                throw createError(400, 'Vote with that name already exists.');
            }
            const creatorToken = crypto.randomBytes(32).toString('hex');

            const sqlInsertPoll = sql`
                INSERT into polls (poll_name, creator_token, max_participants)
                VALUES (${pollName}, ${creatorToken}, ${maxParticipants})
                RETURNING *
                `;
            const { rows: createdPolls } = await fastify.pg.query<
                CreatePollResponse & { created_at: string }
            >(sqlInsertPoll);
            const { id, created_at: createdAt } = createdPolls[0];

            const sqlInsertChoices = sql`
                INSERT into choices (choice_name, poll_id)
                VALUES ${sql.glue(
                    choices.map((choice) => sql`(${choice},${id})`),
                    ',',
                )}`;
            await fastify.pg.query(sqlInsertChoices);

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
