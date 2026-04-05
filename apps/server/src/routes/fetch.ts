import type { PollResponse as PollResponseContract } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants.js';
import { normalizeDatabaseTimestamp } from '../utils/db.js';

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

type RowWithVoterIndex<T> = T & {
    voter: {
        voterIndex: number;
    } | null;
};

const sortByVoterIndex = <T extends RowWithVoterIndex<object>>(
    rows: T[],
): T[] =>
    rows.sort(
        (left, right) =>
            (left.voter?.voterIndex ?? 0) - (right.voter?.voterIndex ?? 0),
    );

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

                const poll = await fastify.db.query.polls.findFirst({
                    where: (fields, { eq }) => eq(fields.id, pollId),
                    columns: {
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
                            orderBy: (fields, { asc }) =>
                                asc(fields.choiceIndex),
                        },
                        voters: {
                            columns: {
                                voterName: true,
                                voterIndex: true,
                            },
                            orderBy: (fields, { asc }) =>
                                asc(fields.voterIndex),
                        },
                        publicKeyShares: {
                            columns: {
                                publicKeyShare: true,
                            },
                            with: {
                                voter: {
                                    columns: {
                                        voterIndex: true,
                                    },
                                },
                            },
                        },
                        encryptedVotes: {
                            columns: {
                                votes: true,
                            },
                            with: {
                                voter: {
                                    columns: {
                                        voterIndex: true,
                                    },
                                },
                            },
                        },
                        decryptionShares: {
                            columns: {
                                shares: true,
                            },
                            with: {
                                voter: {
                                    columns: {
                                        voterIndex: true,
                                    },
                                },
                            },
                        },
                    },
                });
                if (!poll) {
                    throw createError(
                        404,
                        `Vote with ID ${pollId} does not exist.`,
                    );
                }

                const orderedPublicKeyShares = sortByVoterIndex(
                    poll.publicKeyShares,
                );
                const orderedEncryptedVotes = sortByVoterIndex(
                    poll.encryptedVotes,
                );
                const orderedDecryptionShares = sortByVoterIndex(
                    poll.decryptionShares,
                );

                return {
                    pollName: poll.pollName,
                    createdAt: normalizeDatabaseTimestamp(poll.createdAt),
                    choices: poll.choices.map(({ choiceName }) => choiceName),
                    voters: poll.voters.map(({ voterName }) => voterName),
                    isOpen: poll.isOpen,
                    publicKeyShares: orderedPublicKeyShares.map(
                        ({ publicKeyShare }) => publicKeyShare,
                    ),
                    commonPublicKey: poll.commonPublicKey,
                    encryptedVotes: orderedEncryptedVotes.map(
                        ({ votes }) => votes,
                    ),
                    encryptedTallies: poll.encryptedTallies,
                    decryptionShares: orderedDecryptionShares.map(
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
