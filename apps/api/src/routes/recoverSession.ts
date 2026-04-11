import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RecoverSessionRequest as RecoverSessionRequestContract,
    RecoverSessionResponse as RecoverSessionResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { withTransaction } from '../utils/db.js';
import { getPollById } from '../utils/pollReadModel.js';
import {
    authenticateVoterReadOnly,
    hashSecureToken,
} from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const RecoverSessionRequestSchema = Type.Object({
    creatorToken: Type.Optional(SecureTokenSchema),
    voterToken: Type.Optional(SecureTokenSchema),
});

const RecoverSessionResponseSchema = Type.Object({
    role: Type.Union([Type.Literal('creator'), Type.Literal('voter')]),
    pollId: Type.String(),
    pollSlug: Type.String(),
    phase: Type.Union([
        Type.Literal('open'),
        Type.Literal('securing'),
        Type.Literal('ready-to-reveal'),
        Type.Literal('revealing'),
        Type.Literal('complete'),
        Type.Literal('aborted'),
    ]),
    isOpen: Type.Boolean(),
    voterName: Type.Union([Type.String(), Type.Null()]),
    voterIndex: Type.Union([Type.Number(), Type.Null()]),
});

const schema = {
    params: PollIdParamsSchema,
    body: RecoverSessionRequestSchema,
    response: {
        200: RecoverSessionResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

type RecoverSessionRequest = RecoverSessionRequestContract;
type RecoverSessionResponse = RecoverSessionResponseContract;

const hasExactlyOneRecoveryToken = ({
    creatorToken,
    voterToken,
}: RecoverSessionRequest): boolean =>
    Number(Boolean(creatorToken)) + Number(Boolean(voterToken)) === 1;

export const recoverSession = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/recover-session',
        { schema },
        async (
            req: FastifyRequest<{
                Body: RecoverSessionRequest;
                Params: PollIdParams;
            }>,
        ): Promise<RecoverSessionResponse> => {
            const { pollId } = req.params;
            const { creatorToken, voterToken } = req.body;

            if (!hasExactlyOneRecoveryToken(req.body)) {
                throw createError(
                    400,
                    ERROR_MESSAGES.recoverSessionTokenRequired,
                );
            }

            return await withTransaction(fastify, async (tx) => {
                const poll = await getPollById(tx, pollId);

                if (!poll) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                if (creatorToken) {
                    const creator = await tx.query.polls.findFirst({
                        where: (fields, { eq: isEqual }) =>
                            isEqual(fields.id, pollId),
                        columns: {
                            creatorTokenHash: true,
                        },
                    });

                    if (
                        !creator ||
                        creator.creatorTokenHash !==
                            hashSecureToken(creatorToken)
                    ) {
                        throw createError(
                            403,
                            ERROR_MESSAGES.invalidCreatorToken,
                        );
                    }

                    return {
                        role: 'creator',
                        pollId,
                        pollSlug: poll.slug,
                        phase: poll.phase,
                        isOpen: poll.isOpen,
                        voterName: null,
                        voterIndex: null,
                    };
                }

                const voter = await authenticateVoterReadOnly(
                    tx,
                    pollId,
                    voterToken!,
                );

                return {
                    role: 'voter',
                    pollId,
                    pollSlug: poll.slug,
                    phase: poll.phase,
                    isOpen: poll.isOpen,
                    voterName: voter.voterName,
                    voterIndex: voter.voterIndex,
                };
            });
        },
    );
};
