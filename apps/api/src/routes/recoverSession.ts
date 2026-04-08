import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RecoverSessionRequest as RecoverSessionRequestContract,
    RecoverSessionResponse as RecoverSessionResponseContract,
} from '@sealed-vote/contracts';
import { derivePollPhase } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { withTransaction } from '../utils/db.js';
import {
    countPollEncryptedVotes,
    countPollVoters,
    getExistingDecryptionSharesReadOnly,
    getExistingEncryptedVoteReadOnly,
    getExistingPublicKeyShareReadOnly,
} from '../utils/polls.js';
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
        Type.Literal('registration'),
        Type.Literal('key-generation'),
        Type.Literal('voting'),
        Type.Literal('tallying'),
        Type.Literal('decryption'),
        Type.Literal('complete'),
    ]),
    isOpen: Type.Boolean(),
    voterName: Type.Union([Type.String(), Type.Null()]),
    voterIndex: Type.Union([Type.Number(), Type.Null()]),
    hasSubmittedPublicKeyShare: Type.Boolean(),
    hasSubmittedVote: Type.Boolean(),
    hasSubmittedDecryptionShares: Type.Boolean(),
    resultsAvailable: Type.Boolean(),
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

export type RecoverSessionRequest = RecoverSessionRequestContract;
export type RecoverSessionResponse = RecoverSessionResponseContract;

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
                const poll = await tx.query.polls.findFirst({
                    where: (fields, { eq: isEqual }) =>
                        isEqual(fields.id, pollId),
                    columns: {
                        commonPublicKey: true,
                        creatorTokenHash: true,
                        encryptedTallies: true,
                        id: true,
                        isOpen: true,
                        resultScores: true,
                        slug: true,
                    },
                });

                if (!poll) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                const [voterCount, encryptedVoteCount] = await Promise.all([
                    countPollVoters(tx, pollId),
                    countPollEncryptedVotes(tx, pollId),
                ]);

                const phase = derivePollPhase({
                    commonPublicKey: poll.commonPublicKey,
                    encryptedTallyCount: poll.encryptedTallies.length,
                    encryptedVoteCount,
                    isOpen: poll.isOpen,
                    resultScoreCount: poll.resultScores.length,
                    voterCount,
                });

                if (creatorToken) {
                    if (
                        poll.creatorTokenHash !== hashSecureToken(creatorToken)
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
                        phase,
                        isOpen: poll.isOpen,
                        voterName: null,
                        voterIndex: null,
                        hasSubmittedPublicKeyShare: false,
                        hasSubmittedVote: false,
                        hasSubmittedDecryptionShares: false,
                        resultsAvailable: poll.resultScores.length > 0,
                    };
                }

                const voter = await authenticateVoterReadOnly(
                    tx,
                    pollId,
                    voterToken!,
                );

                const [publicKeyShare, existingVote, existingDecryptionShares] =
                    await Promise.all([
                        getExistingPublicKeyShareReadOnly(tx, pollId, voter.id),
                        getExistingEncryptedVoteReadOnly(tx, pollId, voter.id),
                        getExistingDecryptionSharesReadOnly(
                            tx,
                            pollId,
                            voter.id,
                        ),
                    ]);

                return {
                    role: 'voter',
                    pollId,
                    pollSlug: poll.slug,
                    phase,
                    isOpen: poll.isOpen,
                    voterName: voter.voterName,
                    voterIndex: voter.voterIndex,
                    hasSubmittedPublicKeyShare: Boolean(publicKeyShare),
                    hasSubmittedVote: Boolean(existingVote),
                    hasSubmittedDecryptionShares: Boolean(
                        existingDecryptionShares,
                    ),
                    resultsAvailable: poll.resultScores.length > 0,
                };
            });
        },
    );
};
