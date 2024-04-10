import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../constants';

const PollParams = Type.Object({
    pollId: Type.String(),
});

type PollParams = Static<typeof PollParams>;

const EncryptedMessage = Type.Object({
    c1: Type.String(),
    c2: Type.String(),
});

const PollResponse = Type.Object({
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(Type.String()),
    isOpen: Type.Boolean(),
    publicKeyShares: Type.Array(Type.String()),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedVotes: Type.Array(Type.Array(EncryptedMessage)),
    encryptedTallies: Type.Array(EncryptedMessage, { minItems: 0 }),
    decryptionShares: Type.Array(Type.Array(Type.String())),
    results: Type.Array(Type.Number()),
});

export type PollResponse = Static<typeof PollResponse>;

const schema = {
    params: PollParams,
    response: {
        200: PollResponse,
    },
};

export const fetch = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollId',
        { schema },
        async (
            req: FastifyRequest<{ Params: PollParams }>,
        ): Promise<PollResponse> => {
            try {
                const pollId = (req.params as { pollId: string }).pollId;
                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }
                const sqlFindExisting = sql`
                SELECT
                    id,
                    poll_name,
                    created_at,
                    is_open,
                    common_public_key,
                    encrypted_tallies,
                    decryption_shares,
                    results
                FROM polls
                WHERE id = ${pollId}`;
                const {
                    rows: [poll],
                } = await fastify.pg.query<{
                    id: string;
                    poll_name: string;
                    created_at: string;
                    is_open: boolean;
                    common_public_key: string | null;
                    encrypted_tallies: { c1: string; c2: string }[];
                    decryption_shares: string[][];
                    results: number[];
                }>(sqlFindExisting);

                if (!poll) {
                    throw createError(
                        404,
                        `Vote with ID ${pollId} does not exist.`,
                    );
                }

                const sqlSelectChoices = sql`
                SELECT choice_name
                FROM choices
                WHERE poll_id = ${pollId}
                ORDER BY index
            `;
                const { rows: choiceRows } = await fastify.pg.query<{
                    choice_name: string;
                }>(sqlSelectChoices);
                const choices = choiceRows.map(
                    ({ choice_name }) => choice_name,
                );

                const sqlSelectVoters = sql`
                SELECT voter_name
                FROM voters
                WHERE poll_id = ${pollId}
            `;
                const { rows: voterRows } = await fastify.pg.query<{
                    voter_name: string;
                }>(sqlSelectVoters);
                const voters = voterRows.map(({ voter_name }) => voter_name);

                const sqlSelectPublicKeyShares = sql`
                SELECT public_key_share
                FROM public_key_shares
                WHERE poll_id = ${pollId}
            `;
                const { rows: publicKeyShareRows } = await fastify.pg.query<{
                    public_key_share: string;
                }>(sqlSelectPublicKeyShares);
                const publicKeyShares = publicKeyShareRows.map(
                    ({ public_key_share }) => public_key_share,
                );

                const sqlSelectEncryptedVotes = sql`
                SELECT votes
                FROM encrypted_votes
                WHERE poll_id = ${pollId}
            `;
                const { rows: encryptedVoteRows } = await fastify.pg.query<{
                    votes: { c1: string; c2: string }[];
                }>(sqlSelectEncryptedVotes);
                const encryptedVotes = encryptedVoteRows.map(
                    (row) => row.votes,
                );

                return {
                    pollName: poll.poll_name,
                    createdAt: poll.created_at,
                    choices,
                    voters,
                    isOpen: poll.is_open,
                    publicKeyShares,
                    commonPublicKey: poll.common_public_key,
                    encryptedVotes,
                    encryptedTallies: poll.encrypted_tallies || [],
                    decryptionShares: poll.decryption_shares || [],
                    results: poll.results,
                };
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};
