import { randomUUID } from 'node:crypto';

import {
    ERROR_MESSAGES,
    hasBlankStrings,
    hasDuplicateStrings,
    normalizeTrimmedString,
    normalizeTrimmedStrings,
} from '@sealed-vote/contracts';
import type {
    CreatePollRequest as CreatePollRequestContract,
    CreatePollResponse as CreatePollResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { choices as choicesTable, polls } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { areStringArraysEqual } from '../utils/idempotency.js';
import { getCreatePollSlugAttempts } from '../utils/pollSlug.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import { MessageResponseSchema, SecureTokenSchema } from './schemas.js';

const CreatePollRequestSchema = Type.Object(
    {
        choices: Type.Array(Type.String()),
        creatorToken: SecureTokenSchema,
        pollName: Type.String(),
        protocolVersion: Type.Optional(Type.String({ minLength: 1 })),
    },
    {
        additionalProperties: false,
    },
);

const CreatePollResponseSchema = Type.Object({
    id: Type.String(),
    slug: Type.String(),
    creatorToken: Type.String(),
});

const schema = {
    body: CreatePollRequestSchema,
    response: {
        201: CreatePollResponseSchema,
        400: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

type CreatePollRequest = CreatePollRequestContract;
export type CreatePollResponse = CreatePollResponseContract;
const canonicalPollSlugRetryCount = 8;

const getExistingPollByCreatorTokenHash = async (
    fastify: FastifyInstance,
    creatorTokenHash: string,
): Promise<
    | {
          choices: string[];
          id: string;
          pollName: string;
          protocolVersion: string;
          slug: string;
      }
    | undefined
> => {
    const poll = await fastify.db.query.polls.findFirst({
        where: (fields, { eq }) =>
            eq(fields.creatorTokenHash, creatorTokenHash),
        columns: {
            id: true,
            pollName: true,
            protocolVersion: true,
            slug: true,
        },
        with: {
            choices: {
                columns: {
                    choiceName: true,
                },
                orderBy: (fields, { asc }) => asc(fields.choiceIndex),
            },
        },
    });

    return poll
        ? {
              choices: poll.choices.map(({ choiceName }) => choiceName),
              id: poll.id,
              pollName: poll.pollName,
              protocolVersion: poll.protocolVersion,
              slug: poll.slug,
          }
        : undefined;
};

const assertMatchingCreateRequest = ({
    existingPoll,
    normalizedChoices,
    pollName,
    protocolVersion,
}: {
    existingPoll: {
        choices: string[];
        pollName: string;
        protocolVersion: string;
    };
    normalizedChoices: string[];
    pollName: string;
    protocolVersion: string;
}): void => {
    if (
        existingPoll.pollName !== pollName ||
        existingPoll.protocolVersion !== protocolVersion ||
        !areStringArraysEqual(existingPoll.choices, normalizedChoices)
    ) {
        throw createError(409, ERROR_MESSAGES.creatorTokenConflict);
    }
};

export const create = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/create',
        { schema },
        async (
            req: FastifyRequest<{ Body: CreatePollRequest }>,
            reply: FastifyReply,
        ): Promise<CreatePollResponse> => {
            const { choices, creatorToken } = req.body;
            const pollName = normalizeTrimmedString(req.body.pollName);
            const normalizedChoices = normalizeTrimmedStrings(choices);
            const protocolVersion = normalizeTrimmedString(
                req.body.protocolVersion ?? 'v1',
            );

            if (!pollName) {
                throw createError(400, 'Poll name is required.');
            }

            if (normalizedChoices.length < 2) {
                throw createError(400, 'Not enough choices.');
            }

            if (hasBlankStrings(normalizedChoices)) {
                throw createError(400, 'Choice names are required.');
            }

            if (hasDuplicateStrings(normalizedChoices)) {
                throw createError(400, 'Choice names must be unique.');
            }

            if (protocolVersion !== 'v1') {
                throw createError(
                    400,
                    'Only protocol version "v1" is supported.',
                );
            }

            const creatorTokenHash = hashSecureToken(creatorToken);
            const existingPoll = await getExistingPollByCreatorTokenHash(
                fastify,
                creatorTokenHash,
            );

            if (existingPoll) {
                assertMatchingCreateRequest({
                    existingPoll,
                    normalizedChoices,
                    pollName,
                    protocolVersion,
                });

                void reply.code(201);
                void maybeDropTestResponseAfterCommit({
                    reply,
                    request: req,
                });
                return {
                    creatorToken,
                    id: existingPoll.id,
                    slug: existingPoll.slug,
                };
            }

            for (const { id: pollId, slug } of getCreatePollSlugAttempts(
                pollName,
                randomUUID,
                canonicalPollSlugRetryCount,
            )) {
                try {
                    const createdPoll = await withTransaction(
                        fastify,
                        async (tx) => {
                            await tx.insert(polls).values({
                                id: pollId,
                                creatorTokenHash,
                                pollName,
                                protocolVersion,
                                slug,
                            });

                            await tx.insert(choicesTable).values(
                                normalizedChoices.map((choice, index) => ({
                                    choiceName: choice,
                                    pollId,
                                    choiceIndex: index,
                                })),
                            );

                            return {
                                creatorToken,
                                id: pollId,
                                slug,
                            } satisfies CreatePollResponse;
                        },
                    );

                    void reply.code(201);
                    void maybeDropTestResponseAfterCommit({
                        reply,
                        request: req,
                    });
                    return createdPoll;
                } catch (error) {
                    if (
                        isConstraintViolation(
                            error,
                            'unique_creator_token_hash',
                        )
                    ) {
                        const conflictingPoll =
                            await getExistingPollByCreatorTokenHash(
                                fastify,
                                creatorTokenHash,
                            );

                        if (conflictingPoll) {
                            assertMatchingCreateRequest({
                                existingPoll: conflictingPoll,
                                normalizedChoices,
                                pollName,
                                protocolVersion,
                            });

                            void reply.code(201);
                            void maybeDropTestResponseAfterCommit({
                                reply,
                                request: req,
                            });
                            return {
                                creatorToken,
                                id: conflictingPoll.id,
                                slug: conflictingPoll.slug,
                            };
                        }

                        throw createError(
                            409,
                            ERROR_MESSAGES.creatorTokenConflict,
                        );
                    }

                    if (isConstraintViolation(error, 'unique_poll_slug')) {
                        continue;
                    }

                    throw error;
                }
            }

            throw createError(500, 'Unable to generate a unique poll slug.');
        },
    );
};
