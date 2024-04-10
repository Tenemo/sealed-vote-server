import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../constants';
import { multiplyEncryptedValues } from 'threshold-elgamal';
import { serializeEncryptedMessage } from '../utils';

export const VoteRequest = Type.Object({
    votes: Type.Array(
        Type.Object({
            c1: Type.String(),
            c2: Type.String(),
        }),
    ),
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

export const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/vote',
        { schema },
        async (
            req: FastifyRequest<{
                Body: VoteRequest;
                Params: { pollId: string };
            }>,
        ): Promise<VoteResponse> => {
            try {
                const { votes } = req.body;
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                const sqlFindExisting = sql`
                    SELECT id, is_open
                    FROM polls
                    WHERE id = ${pollId}`;
                const { rows: polls } = await fastify.pg.query<{
                    id: string;
                    is_open: boolean;
                }>(sqlFindExisting);

                if (!polls.length) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                if (polls[0].is_open) {
                    throw createError(400, 'Cannot vote in an open poll.');
                }

                const sqlCountVotes = sql`
                    SELECT COUNT(*) AS vote_count
                    FROM encrypted_votes
                    WHERE poll_id = ${pollId}
                `;
                const { rows: voteCountRows } = await fastify.pg.query<{
                    vote_count: string;
                }>(sqlCountVotes);
                const voteCount = parseInt(voteCountRows[0].vote_count, 10);

                const sqlSelectVotersCount = sql`
                    SELECT COUNT(*) AS voters_count
                    FROM voters
                    WHERE poll_id = ${pollId}
                `;
                const { rows: votersCounts } = await fastify.pg.query<{
                    voters_count: string;
                }>(sqlSelectVotersCount);
                const votersCount = parseInt(votersCounts[0].voters_count, 10);

                if (voteCount >= votersCount) {
                    throw createError(
                        403,
                        'Voting limit reached. No more votes can be accepted.',
                    );
                }

                const votesJSON = JSON.stringify(votes).replace(/'/g, "''");

                const sqlInsertEncryptedVotes = `
                    INSERT INTO encrypted_votes (poll_id, votes)
                    VALUES ('${pollId}', '${votesJSON}'::jsonb);
                `;
                await fastify.pg.query(sqlInsertEncryptedVotes);

                const sqlSelectEncryptedVotes = sql`
                    SELECT votes
                    FROM encrypted_votes
                    WHERE poll_id = ${pollId}
                `;
                const { rows: encryptedVoteRows } = await fastify.pg.query<{
                    votes: { c1: string; c2: string }[];
                }>(sqlSelectEncryptedVotes);
                const encryptedVotes = encryptedVoteRows.map(
                    ({ votes }) => votes,
                );

                if (encryptedVotes.length === Number(votersCount)) {
                    const encryptedTallies = encryptedVotes[0].map(
                        (_vote, index) =>
                            serializeEncryptedMessage(
                                encryptedVotes.reduce(
                                    (encryptedTally, votes) =>
                                        multiplyEncryptedValues(
                                            encryptedTally,
                                            {
                                                c1: BigInt(votes[index].c1),
                                                c2: BigInt(votes[index].c2),
                                            },
                                        ),
                                    { c1: 1n, c2: 1n },
                                ),
                            ),
                    );

                    const talliesJSON = JSON.stringify(
                        encryptedTallies,
                    ).replace(/'/g, "''");

                    // eslint-disable-next-line sql/no-unsafe-query
                    const sqlUpdateEncryptedTallies = `
                    UPDATE polls
                    SET encrypted_tallies = '${talliesJSON}'::jsonb
                    WHERE id = '${pollId}';
                `;

                    await fastify.pg.query(sqlUpdateEncryptedTallies);
                }

                return `Voted successfully in poll ${pollId}.`;
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};
