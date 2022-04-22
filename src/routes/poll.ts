import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import SQL from '@nearform/sql';
import createError from 'http-errors';
import gmean from 'gmean';

const PollRequest = Type.Null();

type PollRequest = Static<typeof PollRequest>;

const PollResponse = Type.Object({
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    results: Type.Optional(Type.Record(Type.String(), Type.Number())),
    voters: Type.Array(Type.String()),
});

type PollResponse = Static<typeof PollResponse>;

const schema = {
    body: PollRequest,
    response: {
        200: PollResponse,
    },
};
const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollId',
        { schema },
        async (
            req: FastifyRequest<{ Body: PollRequest }>,
        ): Promise<PollResponse> => {
            const pollId = (req.params as { pollId: string }).pollId;
            const db = await fastify.pg.connect();
            const sqlFindExisting = SQL`
                SELECT id, poll_name, created_at
                FROM polls
                WHERE id = ${pollId}`;
            const { rows: polls } = await fastify.pg.query<{
                id: string;
                poll_name: string;
                created_at: string;
            }>(sqlFindExisting);
            const { poll_name: pollName, created_at: createdAt } = polls[0];
            if (!polls.length) {
                throw createError(
                    400,
                    `Vote with ID ${pollId} does not exist.`,
                );
            }
            const sqlSelectPollsChoicesVotes = SQL`
                SELECT
                    choices.choice_name,
                    votes.voter_name, votes.score
                FROM polls
                JOIN choices
                    ON polls.id = choices.poll_id
                JOIN votes
                    ON polls.id = votes.poll_id
                        AND votes.choice_id = choices.id
                WHERE polls.id = ${pollId}
            `;
            const { rows } = await fastify.pg.query<{
                choice_name: string;
                voter_name: string;
                score: number;
            }>(sqlSelectPollsChoicesVotes);
            const choices = [
                ...new Set(rows.map(({ choice_name }) => choice_name)),
            ];
            const voters: string[] = [];
            const resultsWithScores = rows.reduce(
                (
                    acc: Record<string, number[]>,
                    { choice_name, voter_name, score },
                ) => {
                    if (!voters.includes(voter_name)) voters.push(voter_name);
                    if (!acc[choice_name]) {
                        return { ...acc, [choice_name]: [score] };
                    }
                    return {
                        ...acc,
                        [choice_name]: [...acc[choice_name], score],
                    };
                },
                {},
            );
            const results = Object.entries(resultsWithScores).reduce(
                (acc, [choiceName, scores]) => ({
                    ...acc,
                    [choiceName]: gmean(scores).toFixed(2),
                }),
                {},
            );

            if (voters.length < 2) {
                return {
                    pollName,
                    createdAt,
                    choices,
                    voters,
                };
            }
            db.release();

            return {
                pollName,
                createdAt,
                choices,
                results,
                voters,
            };
        },
    );
};

export default vote;
