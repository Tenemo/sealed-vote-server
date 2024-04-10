import sql from '@nearform/sql';
import { Type, Static } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';

const RegisterRequest = Type.Object({
    voterName: Type.String(),
});

type RegisterRequest = Static<typeof RegisterRequest>;

const RegisterResponse = Type.Object({
    message: Type.String(),
});

export type RegisterResponse = Static<typeof RegisterResponse>;

const schema = {
    body: RegisterRequest,
    response: {
        201: RegisterResponse,
        400: Type.Object({
            message: Type.String(),
        }),
        409: Type.Object({
            message: Type.String(),
        }),
    },
};

export const register = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/register',
        { schema },
        async (
            req: FastifyRequest<{
                Body: RegisterRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<RegisterResponse> => {
            try {
                const { voterName } = req.body;
                const { pollId } = req.params;
                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                // Check if the poll is open for registration
                const sqlCheckPollOpen = sql`
                SELECT is_open
                FROM polls
                WHERE id = ${pollId}
            `;
                const { rows: pollStatus } = await fastify.pg.query<{
                    is_open: boolean;
                }>(sqlCheckPollOpen);

                if (pollStatus.length === 0) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                if (!pollStatus[0].is_open) {
                    throw createError(
                        400,
                        'Poll is closed for new registrations.',
                    );
                }

                // Check if the voter name already exists for this poll
                const sqlFindExistingVoter = sql`
                SELECT id
                FROM voters
                WHERE poll_id = ${pollId}
                AND voter_name = ${voterName}
            `;
                const { rows: existingVoters } =
                    await fastify.pg.query(sqlFindExistingVoter);
                if (existingVoters.length) {
                    throw createError(
                        409,
                        `Voter name "${voterName}" has already been taken for this vote`,
                    );
                }
                // Calculate the new voter index
                const { rows: voterCounts } = await fastify.pg.query<{
                    count: number;
                }>(sql`
                SELECT COUNT(*) AS count FROM voters WHERE poll_id = ${pollId}
            `);

                const voterIndex = voterCounts[0].count + 1; // Assuming the count starts from 0

                // Insert the new voter with voterIndex
                await fastify.pg.query(sql`
                INSERT INTO voters (voter_name, poll_id, voter_index)
                VALUES (${voterName}, ${pollId}, ${voterIndex})
            `);

                void reply.code(201);

                return { message: 'Voter registered successfully' };
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};

export default register;
