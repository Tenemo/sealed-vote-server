import {
    isUuid,
    type PollResponse as PollResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { count, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import {
    decryptionShares,
    encryptedVotes,
    publicKeyShares,
} from '../db/schema.js';
import { normalizeDatabaseTimestamp } from '../utils/db.js';

import {
    EncryptedMessageSchema,
    PollRefParamsSchema,
    type PollRefParams,
} from './schemas.js';

const PollResponseSchema = Type.Object({
    id: Type.String(),
    slug: Type.String(),
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(Type.String()),
    isOpen: Type.Boolean(),
    publicKeyShareCount: Type.Number(),
    encryptedVoteCount: Type.Number(),
    decryptionShareCount: Type.Number(),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedTallies: Type.Array(EncryptedMessageSchema),
    results: Type.Array(Type.Number()),
});

const schema = {
    params: PollRefParamsSchema,
    response: {
        200: PollResponseSchema,
    },
};

export type PollResponse = PollResponseContract;

export const fetch = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollRef',
        { schema },
        async (
            req: FastifyRequest<{ Params: PollRefParams }>,
        ): Promise<PollResponse> => {
            const { pollRef } = req.params;
            const isPollId = isUuid(pollRef);

            const poll = await fastify.db.query.polls.findFirst({
                where: (fields, { eq: isEqual }) =>
                    isPollId
                        ? isEqual(fields.id, pollRef)
                        : isEqual(fields.slug, pollRef),
                columns: {
                    id: true,
                    slug: true,
                    pollName: true,
                    createdAt: true,
                    isOpen: true,
                    commonPublicKey: true,
                    encryptedTallies: true,
                    results: true,
                },
                with: {
                    choices: {
                        columns: {
                            choiceName: true,
                        },
                        orderBy: (fields, { asc }) => asc(fields.choiceIndex),
                    },
                    voters: {
                        columns: {
                            voterName: true,
                        },
                        orderBy: (fields, { asc }) => asc(fields.voterIndex),
                    },
                },
            });

            if (!poll) {
                throw createError(404, `Poll ${pollRef} does not exist.`);
            }

            const [
                publicKeyShareCountRow,
                encryptedVoteCountRow,
                decryptionShareCountRow,
            ] = await Promise.all([
                fastify.db
                    .select({ count: count() })
                    .from(publicKeyShares)
                    .where(eq(publicKeyShares.pollId, poll.id)),
                fastify.db
                    .select({ count: count() })
                    .from(encryptedVotes)
                    .where(eq(encryptedVotes.pollId, poll.id)),
                fastify.db
                    .select({ count: count() })
                    .from(decryptionShares)
                    .where(eq(decryptionShares.pollId, poll.id)),
            ]);

            return {
                id: poll.id,
                slug: poll.slug,
                pollName: poll.pollName,
                createdAt: normalizeDatabaseTimestamp(poll.createdAt),
                choices: poll.choices.map(({ choiceName }) => choiceName),
                voters: poll.voters.map(({ voterName }) => voterName),
                isOpen: poll.isOpen,
                publicKeyShareCount: publicKeyShareCountRow[0]?.count ?? 0,
                encryptedVoteCount: encryptedVoteCountRow[0]?.count ?? 0,
                decryptionShareCount: decryptionShareCountRow[0]?.count ?? 0,
                commonPublicKey: poll.commonPublicKey,
                encryptedTallies: poll.encryptedTallies,
                results: poll.results,
            };
        },
    );
};
