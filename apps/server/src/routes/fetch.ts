import type { PollResponse as PollResponseContract } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { asc, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants';
import {
    choices,
    decryptionShares,
    encryptedVotes,
    polls,
    publicKeyShares,
    voters,
} from '../db/schema';
import { normalizeDatabaseTimestamp } from '../utils/db';

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

                const [poll] = await fastify.db
                    .select({
                        pollName: polls.pollName,
                        createdAt: polls.createdAt,
                        isOpen: polls.isOpen,
                        commonPublicKey: polls.commonPublicKey,
                        encryptedTallies: polls.encryptedTallies,
                        results: polls.results,
                    })
                    .from(polls)
                    .where(eq(polls.id, pollId));
                if (!poll) {
                    throw createError(
                        404,
                        `Vote with ID ${pollId} does not exist.`,
                    );
                }

                const [
                    choiceRows,
                    voterRows,
                    publicKeyShareRows,
                    encryptedVoteRows,
                    decryptionShareRows,
                ] = await Promise.all([
                    fastify.db
                        .select({
                            choiceName: choices.choiceName,
                        })
                        .from(choices)
                        .where(eq(choices.pollId, pollId))
                        .orderBy(asc(choices.choiceIndex)),
                    fastify.db
                        .select({
                            voterName: voters.voterName,
                        })
                        .from(voters)
                        .where(eq(voters.pollId, pollId))
                        .orderBy(asc(voters.voterIndex)),
                    fastify.db
                        .select({
                            publicKeyShare: publicKeyShares.publicKeyShare,
                        })
                        .from(publicKeyShares)
                        .innerJoin(
                            voters,
                            eq(voters.id, publicKeyShares.voterId),
                        )
                        .where(eq(publicKeyShares.pollId, pollId))
                        .orderBy(asc(voters.voterIndex)),
                    fastify.db
                        .select({
                            votes: encryptedVotes.votes,
                        })
                        .from(encryptedVotes)
                        .innerJoin(
                            voters,
                            eq(voters.id, encryptedVotes.voterId),
                        )
                        .where(eq(encryptedVotes.pollId, pollId))
                        .orderBy(asc(voters.voterIndex)),
                    fastify.db
                        .select({
                            shares: decryptionShares.shares,
                        })
                        .from(decryptionShares)
                        .innerJoin(
                            voters,
                            eq(voters.id, decryptionShares.voterId),
                        )
                        .where(eq(decryptionShares.pollId, pollId))
                        .orderBy(asc(voters.voterIndex)),
                ]);

                return {
                    pollName: poll.pollName,
                    createdAt: normalizeDatabaseTimestamp(poll.createdAt),
                    choices: choiceRows.map(({ choiceName }) => choiceName),
                    voters: voterRows.map(({ voterName }) => voterName),
                    isOpen: poll.isOpen,
                    publicKeyShares: publicKeyShareRows.map(
                        ({ publicKeyShare }) => publicKeyShare,
                    ),
                    commonPublicKey: poll.commonPublicKey,
                    encryptedVotes: encryptedVoteRows.map(({ votes }) => votes),
                    encryptedTallies: poll.encryptedTallies,
                    decryptionShares: decryptionShareRows.map(
                        ({ shares }) => shares,
                    ),
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
