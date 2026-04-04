import sql from '@nearform/sql';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { isConstraintViolation, withTransaction } from '../utils/db';
import { generateSecureToken } from '../utils/voterAuth';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    CreatePollRequest as CreatePollRequestContract,
    CreatePollResponse as CreatePollResponseContract,
    MessageResponse,
} from '@sealed-vote/contracts';

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
                    async (client) => {
                        const insertPollQuery = sql`
                        INSERT INTO polls (poll_name, creator_token, max_participants)
                        VALUES (${pollName}, ${creatorToken}, ${maxParticipants})
                        RETURNING id, created_at, max_participants
                    `;
                        const { rows } = await client.query<{
                            id: string;
                            created_at: string;
                            max_participants: number;
                        }>(insertPollQuery);

                        const poll = rows[0];
                        const insertChoicesQuery = sql`
                        INSERT INTO choices (choice_name, poll_id, index)
                        VALUES ${sql.glue(
                            normalizedChoices.map(
                                (choice, index) =>
                                    sql`(${choice}, ${poll.id}, ${index})`,
                            ),
                            ',',
                        )}
                    `;

                        await client.query(insertChoicesQuery);

                        return {
                            pollName,
                            creatorToken,
                            choices: normalizedChoices,
                            maxParticipants: poll.max_participants,
                            id: poll.id,
                            createdAt: poll.created_at,
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
