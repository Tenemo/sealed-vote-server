import sql from '@nearform/sql';
import type { PollResponse as PollResponseContract } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';

const PollParamsSchema = Type.Object({
    pollId: Type.String(),
});

const EncryptedMessageSchema = Type.Object({
    c1: Type.String(),
    c2: Type.String(),
});

const PollResponseSchema = Type.Object({
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(Type.String()),
    isOpen: Type.Boolean(),
    publicKeyShares: Type.Array(Type.String()),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedVotes: Type.Array(Type.Array(EncryptedMessageSchema)),
    encryptedTallies: Type.Array(EncryptedMessageSchema),
    decryptionShares: Type.Array(Type.Array(Type.String())),
    results: Type.Array(Type.Number()),
});

const schema = {
    params: PollParamsSchema,
    response: {
        200: PollResponseSchema,
    },
};

export type PollParams = {
    pollId: string;
};

export type PollResponse = PollResponseContract;

export const fetch = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollId',
        { schema },
        async (
            req: FastifyRequest<{ Params: PollParams }>,
        ): Promise<PollResponse> => {
            try {
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                const pollQuery = sql`
                    SELECT
                        poll_name,
                        created_at,
                        is_open,
                        common_public_key,
                        encrypted_tallies,
                        results
                    FROM polls
                    WHERE id = ${pollId}
                `;
                const { rows: polls } = await fastify.pg.query<{
                    poll_name: string;
                    created_at: string;
                    is_open: boolean;
                    common_public_key: string | null;
                    encrypted_tallies: { c1: string; c2: string }[];
                    results: number[];
                }>(pollQuery);

                const poll = polls[0];
                if (!poll) {
                    throw createError(
                        404,
                        `Vote with ID ${pollId} does not exist.`,
                    );
                }

                const choicesQuery = sql`
                    SELECT choice_name
                    FROM choices
                    WHERE poll_id = ${pollId}
                    ORDER BY index
                `;
                const { rows: choiceRows } = await fastify.pg.query<{
                    choice_name: string;
                }>(choicesQuery);

                const votersQuery = sql`
                    SELECT voter_name
                    FROM voters
                    WHERE poll_id = ${pollId}
                    ORDER BY voter_index
                `;
                const { rows: voterRows } = await fastify.pg.query<{
                    voter_name: string;
                }>(votersQuery);

                const publicKeySharesQuery = sql`
                    SELECT public_key_shares.public_key_share
                    FROM public_key_shares
                    INNER JOIN voters ON voters.id = public_key_shares.voter_id
                    WHERE public_key_shares.poll_id = ${pollId}
                    ORDER BY voters.voter_index
                `;
                const { rows: publicKeyShareRows } = await fastify.pg.query<{
                    public_key_share: string;
                }>(publicKeySharesQuery);

                const encryptedVotesQuery = sql`
                    SELECT encrypted_votes.votes
                    FROM encrypted_votes
                    INNER JOIN voters ON voters.id = encrypted_votes.voter_id
                    WHERE encrypted_votes.poll_id = ${pollId}
                    ORDER BY voters.voter_index
                `;
                const { rows: encryptedVoteRows } = await fastify.pg.query<{
                    votes: { c1: string; c2: string }[];
                }>(encryptedVotesQuery);

                const decryptionSharesQuery = sql`
                    SELECT decryption_shares.shares
                    FROM decryption_shares
                    INNER JOIN voters ON voters.id = decryption_shares.voter_id
                    WHERE decryption_shares.poll_id = ${pollId}
                    ORDER BY voters.voter_index
                `;
                const { rows: decryptionShareRows } = await fastify.pg.query<{
                    shares: string[];
                }>(decryptionSharesQuery);

                return {
                    pollName: poll.poll_name,
                    createdAt: poll.created_at,
                    choices: choiceRows.map(({ choice_name }) => choice_name),
                    voters: voterRows.map(({ voter_name }) => voter_name),
                    isOpen: poll.is_open,
                    publicKeyShares: publicKeyShareRows.map(
                        ({ public_key_share }) => public_key_share,
                    ),
                    commonPublicKey: poll.common_public_key,
                    encryptedVotes: encryptedVoteRows.map(({ votes }) => votes),
                    encryptedTallies: poll.encrypted_tallies ?? [],
                    decryptionShares: decryptionShareRows.map(
                        ({ shares }) => shares,
                    ),
                    results: poll.results ?? [],
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
