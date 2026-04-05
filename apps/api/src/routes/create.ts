import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    CreatePollRequest as CreatePollRequestContract,
    CreatePollResponse as CreatePollResponseContract,
    MessageResponse,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { choices as choicesTable, polls } from '../db/schema.js';
import {
    isConstraintViolation,
    normalizeDatabaseTimestamp,
    withTransaction,
} from '../utils/db.js';
import { generateSecureToken } from '../utils/voterAuth.js';

const EncryptedMessageSchema = Type.Object({
    c1: Type.String(),
    c2: Type.String(),
});

const CreatePollRequestSchema = Type.Object({
    choices: Type.Array(Type.String()),
    pollName: Type.String(),
    maxParticipants: Type.Optional(Type.Number({ minimum: 2 })),
});

const CreatePollResponseSchema = Type.Object({
    pollName: Type.String(),
    creatorToken: Type.String(),
    choices: Type.Array(Type.String()),
    maxParticipants: Type.Number(),
    id: Type.String(),
    createdAt: Type.String(),
    publicKeyShares: Type.Array(Type.String()),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedVotes: Type.Array(Type.Array(EncryptedMessageSchema)),
    encryptedTallies: Type.Array(EncryptedMessageSchema),
    decryptionShares: Type.Array(Type.Array(Type.String())),
    results: Type.Array(Type.Number()),
});

const MessageResponseSchema = Type.Object({
    message: Type.String(),
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
                const { choices, pollName, maxParticipants = 20 } = req.body;
                const normalizedChoices = choices.map((choice) =>
                    choice.trim(),
                );

                if (normalizedChoices.length < 2) {
                    throw createError(400, 'Not enough choices.');
                }

                if (
                    new Set(normalizedChoices).size !== normalizedChoices.length
                ) {
                    throw createError(400, 'Choice names must be unique.');
                }

                const creatorToken = generateSecureToken();

                const createdPoll = await withTransaction(
                    fastify,
                    async (tx) => {
                        const [poll] = await tx
                            .insert(polls)
                            .values({
                                pollName,
                                creatorToken,
                                maxParticipants,
                            })
                            .returning({
                                id: polls.id,
                                createdAt: polls.createdAt,
                                maxParticipants: polls.maxParticipants,
                            });

                        await tx.insert(choicesTable).values(
                            normalizedChoices.map((choice, index) => ({
                                choiceName: choice,
                                pollId: poll.id,
                                choiceIndex: index,
                            })),
                        );

                        return {
                            pollName,
                            creatorToken,
                            choices: normalizedChoices,
                            maxParticipants: poll.maxParticipants,
                            id: poll.id,
                            createdAt: normalizeDatabaseTimestamp(
                                poll.createdAt,
                            ),
                            publicKeyShares: [],
                            commonPublicKey: null,
                            encryptedVotes: [],
                            encryptedTallies: [],
                            decryptionShares: [],
                            results: [],
                        } satisfies CreatePollResponse;
                    },
                );

                void reply.code(201);
                return createdPoll;
            } catch (error) {
                if (isConstraintViolation(error, 'unique_poll_name')) {
                    throw createError(409, ERROR_MESSAGES.duplicatePollName);
                }

                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }

                throw error;
            }
        },
    );
};

export type CreatePollErrorResponse = MessageResponse;
