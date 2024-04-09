import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../../constants';

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
            const { voterName } = req.body;
            const { pollId } = req.params;
            if (!uuidRegex.test(pollId)) {
                throw createError(400, 'Invalid poll ID');
            }

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

            const sqlGetVoterCount = sql`
                SELECT COUNT(*) AS voter_count
                FROM voters
                WHERE poll_id = ${pollId}
            `;
            const { rows: voterCounts } = await fastify.pg.query<{
                voter_count: number;
            }>(sqlGetVoterCount);
            const voterIndex = voterCounts[0].voter_count + 1;

            const sqlInsertVoter = sql`
                INSERT INTO voters (voter_name, voter_index, poll_id)
                VALUES (${voterName}, ${voterIndex}, ${pollId})
            `;
            await fastify.pg.query(sqlInsertVoter);
            void reply.code(201);

            return { message: 'Voter registered successfully' };
        },
    );
};

export default register;
