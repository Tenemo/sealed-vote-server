import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RegisterVoterRequest as RegisterVoterRequestContract,
    RegisterVoterResponse as RegisterVoterResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { uuidRegex } from '../constants.js';
import { voters } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { countPollVoters, lockPollById } from '../utils/polls.js';
import { generateSecureToken, hashSecureToken } from '../utils/voterAuth.js';

const RegisterRequestSchema = Type.Object({
    voterName: Type.String({ minLength: 1, maxLength: 32 }),
});

const RegisterResponseSchema = Type.Object({
    message: Type.String(),
    voterIndex: Type.Number(),
    voterName: Type.String(),
    pollId: Type.String(),
    voterToken: Type.String(),
});

const MessageResponseSchema = Type.Object({
    message: Type.String(),
});

const schema = {
    body: RegisterRequestSchema,
    response: {
        201: RegisterResponseSchema,
        400: MessageResponseSchema,
        404: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

export type RegisterRequest = RegisterVoterRequestContract;
export type RegisterResponse = RegisterVoterResponseContract;

export const register = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/register',
        { schema },
        async (
            req: FastifyRequest<{
                Body: RegisterRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<RegisterResponse> => {
            try {
                const voterName = req.body.voterName.trim();
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, ERROR_MESSAGES.invalidPollId);
                }

                if (!voterName) {
                    throw createError(400, 'Voter name is required.');
                }

                const voterToken = generateSecureToken();
                const voterTokenHash = hashSecureToken(voterToken);

                const response = await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (!poll.isOpen) {
                        throw createError(400, ERROR_MESSAGES.pollClosed);
                    }

                    const voterCount = await countPollVoters(tx, pollId);

                    if (voterCount >= poll.maxParticipants) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.maxParticipantsReached,
                        );
                    }

                    const voterIndex = voterCount + 1;
                    await tx.insert(voters).values({
                        voterName,
                        voterIndex,
                        pollId,
                        voterTokenHash,
                    });

                    return {
                        message: 'Voter registered successfully',
                        voterIndex,
                        voterName,
                        pollId,
                        voterToken,
                    } satisfies RegisterResponse;
                });

                void reply.code(201);
                return response;
            } catch (error) {
                if (
                    isConstraintViolation(error, 'unique_voter_name_per_poll')
                ) {
                    throw createError(409, ERROR_MESSAGES.duplicateVoterName);
                }

                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }

                throw error;
            }
        },
    );
};

export default register;
