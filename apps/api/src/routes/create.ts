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
import { generateSecureToken, hashSecureToken } from '../utils/voterAuth.js';

import { MessageResponseSchema } from './schemas.js';

const CreatePollRequestSchema = Type.Object({
    choices: Type.Array(Type.String()),
    pollName: Type.String(),
    maxParticipants: Type.Optional(Type.Number({ minimum: 2 })),
});

const CreatePollResponseSchema = Type.Object({
    id: Type.String(),
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

export const create = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/create',
        { schema },
        async (
            req: FastifyRequest<{ Body: CreatePollRequest }>,
            reply: FastifyReply,
        ): Promise<CreatePollResponse> => {
            try {
                const { choices, maxParticipants = 20 } = req.body;
                const pollName = req.body.pollName.trim();
                const normalizedChoices = choices.map((choice) =>
                    choice.trim(),
                );

                if (!pollName) {
                    throw createError(400, 'Poll name is required.');
                }

                if (normalizedChoices.length < 2) {
                    throw createError(400, 'Not enough choices.');
                }

                if (normalizedChoices.some((choice) => !choice)) {
                    throw createError(400, 'Choice names are required.');
                }

                if (
                    new Set(normalizedChoices).size !== normalizedChoices.length
                ) {
                    throw createError(400, 'Choice names must be unique.');
                }

                const creatorToken = generateSecureToken();
                const creatorTokenHash = hashSecureToken(creatorToken);

                const createdPoll = await withTransaction(
                    fastify,
                    async (tx) => {
                        const [poll] = await tx
                            .insert(polls)
                            .values({
                                creatorTokenHash,
                                pollName,
                                maxParticipants,
                            })
                            .returning({
                                id: polls.id,
                            });

                        await tx.insert(choicesTable).values(
                            normalizedChoices.map((choice, index) => ({
                                choiceName: choice,
                                pollId: poll.id,
                                choiceIndex: index,
                            })),
                        );

                        return {
                            creatorToken,
                            id: poll.id,
                        } satisfies CreatePollResponse;
                    },
                );

                void reply.code(201);
                return createdPoll;
            } catch (error) {
                if (isConstraintViolation(error, 'unique_poll_name')) {
                    throw createError(409, ERROR_MESSAGES.duplicatePollName);
                }

                throw error;
            }
        },
    );
};
