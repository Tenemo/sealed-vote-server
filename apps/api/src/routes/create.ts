import { randomUUID } from 'node:crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    CreatePollRequest as CreatePollRequestContract,
    CreatePollResponse as CreatePollResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { choices as choicesTable, polls } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { getCreatePollSlugAttempts } from '../utils/pollSlug.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import { MessageResponseSchema } from './schemas.js';

const CreatePollRequestSchema = Type.Object({
    choices: Type.Array(Type.String()),
    creatorToken: Type.String(),
    pollName: Type.String(),
    maxParticipants: Type.Optional(Type.Number({ minimum: 2 })),
});

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

export type CreatePollRequest = CreatePollRequestContract;
export type CreatePollResponse = CreatePollResponseContract;
const canonicalPollSlugRetryCount = 8;

const areChoicesEqual = (
    left: readonly string[],
    right: readonly string[],
): boolean =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

const getExistingPollByCreatorTokenHash = async (
    fastify: FastifyInstance,
    creatorTokenHash: string,
): Promise<
    | {
          choices: string[];
          id: string;
          maxParticipants: number;
          pollName: string;
          slug: string;
      }
    | undefined
> => {
    const poll = await fastify.db.query.polls.findFirst({
        where: (fields, { eq }) =>
            eq(fields.creatorTokenHash, creatorTokenHash),
        columns: {
            id: true,
            maxParticipants: true,
            pollName: true,
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
              maxParticipants: poll.maxParticipants,
              pollName: poll.pollName,
              slug: poll.slug,
          }
        : undefined;
};

const assertMatchingCreateRequest = ({
    existingPoll,
    maxParticipants,
    normalizedChoices,
    pollName,
}: {
    existingPoll: {
        choices: string[];
        maxParticipants: number;
        pollName: string;
    };
    maxParticipants: number;
    normalizedChoices: string[];
    pollName: string;
}): void => {
    if (
        existingPoll.pollName !== pollName ||
        existingPoll.maxParticipants !== maxParticipants ||
        !areChoicesEqual(existingPoll.choices, normalizedChoices)
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
            const { choices, creatorToken, maxParticipants = 20 } = req.body;
            const pollName = req.body.pollName.trim();
            const normalizedChoices = choices.map((choice) => choice.trim());

            if (!pollName) {
                throw createError(400, 'Poll name is required.');
            }

            if (normalizedChoices.length < 2) {
                throw createError(400, 'Not enough choices.');
            }

            if (normalizedChoices.some((choice) => !choice)) {
                throw createError(400, 'Choice names are required.');
            }

            if (new Set(normalizedChoices).size !== normalizedChoices.length) {
                throw createError(400, 'Choice names must be unique.');
            }

            const creatorTokenHash = hashSecureToken(creatorToken);
            const existingPoll = await getExistingPollByCreatorTokenHash(
                fastify,
                creatorTokenHash,
            );

            if (existingPoll) {
                assertMatchingCreateRequest({
                    existingPoll,
                    maxParticipants,
                    normalizedChoices,
                    pollName,
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
                                slug,
                                maxParticipants,
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
                                maxParticipants,
                                normalizedChoices,
                                pollName,
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
