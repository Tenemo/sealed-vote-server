import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RecoverSessionRequest as RecoverSessionRequestContract,
    RecoverSessionResponse as RecoverSessionResponseContract,
} from '@sealed-vote/contracts';
import { derivePollPhase } from '@sealed-vote/protocol';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import {
    decryptionShares,
    encryptedVotes,
    publicKeyShares,
} from '../db/schema.js';
import { withTransaction } from '../utils/db.js';
import { getPollPhaseReadModelById } from '../utils/pollReadModel.js';
import { getExistingPollSubmissionValue } from '../utils/pollSubmissions.js';
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
                const poll = await tx.query.polls.findFirst({
                    where: (fields, { eq: isEqual }) =>
                        isEqual(fields.id, pollId),
                    columns: {
                        creatorTokenHash: true,
                    },
                });
                const phaseReadModel = await getPollPhaseReadModelById(
                    tx,
                    pollId,
                );

                if (!poll || !phaseReadModel) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                const phase = derivePollPhase({
                    commonPublicKey: phaseReadModel.commonPublicKey,
                    encryptedTallyCount: phaseReadModel.encryptedTallyCount,
                    encryptedVoteCount: phaseReadModel.encryptedVoteCount,
                    isOpen: phaseReadModel.isOpen,
                    resultScoreCount: phaseReadModel.resultScoreCount,
                    voterCount: phaseReadModel.voterCount,
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
                        pollSlug: phaseReadModel.slug,
                        phase,
                        isOpen: phaseReadModel.isOpen,
                        voterName: null,
                        voterIndex: null,
                        hasSubmittedPublicKeyShare: false,
                        hasSubmittedVote: false,
                        hasSubmittedDecryptionShares: false,
                        resultsAvailable: phaseReadModel.resultScoreCount > 0,
                    };
                }

                const voter = await authenticateVoterReadOnly(
                    tx,
                    pollId,
                    voterToken!,
                );

                const [publicKeyShare, existingVote, existingDecryptionShares] =
                    await Promise.all([
                        getExistingPollSubmissionValue<string>({
                            db: tx,
                            pollId,
                            table: publicKeyShares,
                            valueColumn: publicKeyShares.publicKeyShare,
                            voterId: voter.id,
                        }),
                        getExistingPollSubmissionValue<
                            typeof encryptedVotes.$inferSelect.votes
                        >({
                            db: tx,
                            pollId,
                            table: encryptedVotes,
                            valueColumn: encryptedVotes.votes,
                            voterId: voter.id,
                        }),
                        getExistingPollSubmissionValue<
                            typeof decryptionShares.$inferSelect.shares
                        >({
                            db: tx,
                            pollId,
                            table: decryptionShares,
                            valueColumn: decryptionShares.shares,
                            voterId: voter.id,
                        }),
                    ]);

                return {
                    role: 'voter',
                    pollId,
                    pollSlug: phaseReadModel.slug,
                    phase,
                    isOpen: phaseReadModel.isOpen,
                    voterName: voter.voterName,
                    voterIndex: voter.voterIndex,
                    hasSubmittedPublicKeyShare: Boolean(publicKeyShare),
                    hasSubmittedVote: Boolean(existingVote),
                    hasSubmittedDecryptionShares: Boolean(
                        existingDecryptionShares,
                    ),
                    resultsAvailable: phaseReadModel.resultScoreCount > 0,
                };
            });
        },
    );
};
