import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../../constants';

const PollParams = Type.Object({
    pollId: Type.String(),
});

type PollParams = Static<typeof PollParams>;

const PollResponse = Type.Object({
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(Type.String()),
    isOpen: Type.Boolean(),
    publicKeyShares: Type.Array(Type.String()),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedVotes: Type.Array(
        Type.Array(
            Type.Object({
                c1: Type.String(),
                c2: Type.String(),
            }),
        ),
    ),
    encryptedTallies: Type.Array(
        Type.Object({
            c1: Type.String(),
            c2: Type.String(),
        }),
    ),
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
                    results
                FROM polls
                WHERE id = ${pollId}`;
            const { rows: polls } = await fastify.pg.query<{
                id: string;
                poll_name: string;
                created_at: string;
                is_open: boolean;
                common_public_key: string | null;
                encrypted_tallies: { c1: string; c2: string }[];
                results: number[];
            }>(sqlFindExisting);

            if (!polls.length) {
                throw createError(
                    404,
                    `Vote with ID ${pollId} does not exist.`,
                );
            }
            const {
                poll_name: pollName,
                created_at: createdAt,
                is_open: isOpen,
                common_public_key: commonPublicKey,
                encrypted_tallies: encryptedTallies,
                results,
            } = polls[0];

            const sqlSelectChoices = sql`
                SELECT choice_name
                FROM choices
                WHERE poll_id = ${pollId}
            `;
            const { rows: choiceRows } = await fastify.pg.query<{
                choice_name: string;
            }>(sqlSelectChoices);
            const choices = choiceRows.map(({ choice_name }) => choice_name);

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
                SELECT array_agg(json_build_object('c1', c1, 'c2', c2)) AS vote
                FROM encrypted_votes
                WHERE poll_id = ${pollId}
                GROUP BY poll_id
            `;
            const { rows: encryptedVoteRows } = await fastify.pg.query<{
                vote: { c1: string; c2: string }[];
            }>(sqlSelectEncryptedVotes);
            const encryptedVotes = encryptedVoteRows.map(({ vote }) => vote);

            const sqlSelectDecryptionShares = sql`
                SELECT array_agg(decryption_share) AS shares
                FROM decryption_shares
                WHERE poll_id = ${pollId}
                GROUP BY poll_id
            `;
            const { rows: decryptionShareRows } = await fastify.pg.query<{
                shares: string[];
            }>(sqlSelectDecryptionShares);
            const decryptionShares = decryptionShareRows.map(
                ({ shares }) => shares,
            );

            return {
                pollName,
                createdAt,
                choices,
                voters,
                isOpen,
                publicKeyShares,
                commonPublicKey,
                encryptedVotes,
                encryptedTallies,
                decryptionShares,
                results,
            };
        },
    );
};
