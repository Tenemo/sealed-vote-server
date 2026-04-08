import { randomUUID } from 'node:crypto';

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
import { generateSecureToken, hashSecureToken } from '../utils/voterAuth.js';

import { MessageResponseSchema } from './schemas.js';

const CreatePollRequestSchema = Type.Object({
    choices: Type.Array(Type.String()),
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
    },
};

export type CreatePollRequest = CreatePollRequestContract;
export type CreatePollResponse = CreatePollResponseContract;
const canonicalPollSlugRetryCount = 8;

export const create = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/create',
        { schema },
        async (
            req: FastifyRequest<{ Body: CreatePollRequest }>,
            reply: FastifyReply,
        ): Promise<CreatePollResponse> => {
            const { choices, maxParticipants = 20 } = req.body;
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

            const creatorToken = generateSecureToken();
            const creatorTokenHash = hashSecureToken(creatorToken);

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
                    return createdPoll;
                } catch (error) {
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
