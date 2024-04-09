import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';

export const VoteRequest = Type.Object({
    votes: Type.Record(Type.String(), Type.Number()),
    voterName: Type.String(),
});

type VoteRequest = Static<typeof VoteRequest>;

const VoteResponse = Type.String();

export type VoteResponse = Static<typeof VoteResponse>;

const schema = {
    body: VoteRequest,
    response: {
        200: VoteResponse,
    },
};
const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/vote',
        { schema },
        async (
            req: FastifyRequest<{ Body: VoteRequest }>,
        ): Promise<VoteResponse> => {
            const { votes, voterName } = req.body;
            const pollId = (req.params as { pollId: string }).pollId;
            const sqlFindExisting = sql`
                SELECT id
                FROM polls
                WHERE id = ${pollId}`;
            const { rows: polls } = await fastify.pg.query(sqlFindExisting);
            if (!polls.length) {
                throw createError(
                    400,
                    `Poll with ID ${pollId} does not exist.`,
                );
            }
            const sqlSelectChoices = sql`
                SELECT id, choice_name
                FROM choices
                WHERE choice_name IN (${sql.glue(
                    Object.keys(votes).map((choiceName) => sql`${choiceName}`),
                    ',',
                )})
                AND poll_id = ${pollId}
            `;
            const { rows: choices } = await fastify.pg.query<{
                id: string;
                choice_name: string;
            }>(sqlSelectChoices);
            const correctVotes = Object.entries(votes).reduce(
                (acc, [choiceName, score]) => {
                    const id = choices.find(
                        ({ choice_name }) => choice_name === choiceName,
                    )?.id;
                    if (!id) {
                        return acc;
                    }
                    return {
                        ...acc,
                        [id]: score,
                    };
                },
                {},
            );
            const sqlInsertVotes = sql`
                INSERT into votes (voter_name, score, poll_id, choice_id)
                VALUES ${sql.glue(
                    Object.entries(correctVotes).map(
                        ([id, score]) =>
                            sql`(${voterName}, ${score}, ${pollId}, ${id})`,
                    ),
                    ',',
                )}
            `;
            await fastify.pg.query(sqlInsertVotes);
            return `Voted successfully in vote ${pollId}.`;
        },
    );
};

export default vote;
