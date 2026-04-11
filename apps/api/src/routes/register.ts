import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RegisterVoterRequest as RegisterVoterRequestContract,
    RegisterVoterResponse as RegisterVoterResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import type { DatabaseTransaction } from '../db/client.js';
import { publicKeyShares, voters } from '../db/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/db.js';
import { countPollVoters } from '../utils/pollCounts.js';
import { maxPollParticipants } from '../utils/pollLimits.js';
import { lockPollById } from '../utils/pollLocks.js';
import {
    parseParticipantDeviceRecord,
    serializeParticipantDeviceRecord,
} from '../utils/participantDevices.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voterAuth.js';

import {
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    type PollIdParams,
} from './schemas.js';

const RegisterRequestSchema = Type.Object({
    authPublicKey: Type.String({ minLength: 1 }),
    creatorToken: Type.Optional(SecureTokenSchema),
    transportPublicKey: Type.String({ minLength: 1 }),
    transportSuite: Type.Literal('X25519'),
    voterName: Type.String({ minLength: 1, maxLength: 32 }),
    voterToken: SecureTokenSchema,
});

const RegisterResponseSchema = Type.Object({
    message: Type.String(),
    voterIndex: Type.Number(),
    voterName: Type.String(),
    pollId: Type.String(),
    voterToken: Type.String(),
});

const schema = {
    params: PollIdParamsSchema,
    body: RegisterRequestSchema,
    response: {
        201: RegisterResponseSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
        409: MessageResponseSchema,
    },
};

type RegisterRequest = RegisterVoterRequestContract;
type RegisterResponse = RegisterVoterResponseContract;
type ExistingRegistration = {
    id: string;
    publicKeyShares: {
        id: string;
        publicKeyShare: string;
    }[];
    voterIndex: number;
    voterName: string;
};

const getExistingRegistration = async ({
    pollId,
    tx,
    voterTokenHash,
}: {
    pollId: string;
    tx: DatabaseTransaction;
    voterTokenHash: string;
}): Promise<ExistingRegistration | undefined> =>
    await tx.query.voters.findFirst({
        where: (fields, { and: andOperator, eq: isEqual }) =>
            andOperator(
                isEqual(fields.pollId, pollId),
                isEqual(fields.voterTokenHash, voterTokenHash),
            ),
        columns: {
            id: true,
            voterIndex: true,
            voterName: true,
        },
        with: {
            publicKeyShares: {
                columns: {
                    id: true,
                    publicKeyShare: true,
                },
            },
        },
    });

const hasMatchingParticipantDeviceRecord = ({
    authPublicKey,
    deviceRecord,
    transportPublicKey,
    transportSuite,
}: {
    authPublicKey: string;
    deviceRecord: {
        authPublicKey: string;
        transportPublicKey: string;
        transportSuite: 'X25519';
    };
    transportPublicKey: string;
    transportSuite: 'X25519';
}): boolean =>
    deviceRecord.authPublicKey === authPublicKey &&
    deviceRecord.transportPublicKey === transportPublicKey &&
    deviceRecord.transportSuite === transportSuite;

const reconcileExistingParticipantDeviceRecord = async ({
    authPublicKey,
    existingRegistration,
    pollId,
    serializedDeviceRecord,
    transportPublicKey,
    transportSuite,
    tx,
}: {
    authPublicKey: string;
    existingRegistration: ExistingRegistration;
    pollId: string;
    serializedDeviceRecord: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
    tx: DatabaseTransaction;
}): Promise<void> => {
    const existingPublicKeyShare = existingRegistration.publicKeyShares[0];
    const existingDeviceRecord = parseParticipantDeviceRecord(
        existingPublicKeyShare?.publicKeyShare,
    );

    if (existingDeviceRecord) {
        if (
            !hasMatchingParticipantDeviceRecord({
                authPublicKey,
                deviceRecord: existingDeviceRecord,
                transportPublicKey,
                transportSuite,
            })
        ) {
            throw createError(409, ERROR_MESSAGES.voterTokenConflict);
        }

        return;
    }

    if (!existingPublicKeyShare) {
        await tx.insert(publicKeyShares).values({
            pollId,
            publicKeyShare: serializedDeviceRecord,
            voterId: existingRegistration.id,
        });
        return;
    }

    await tx
        .update(publicKeyShares)
        .set({
            publicKeyShare: serializedDeviceRecord,
        })
        .where(eq(publicKeyShares.id, existingPublicKeyShare.id));
};

export const register = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId/register',
        { schema },
        async (
            req: FastifyRequest<{
                Body: RegisterRequest;
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<RegisterResponse> => {
            const { authPublicKey, transportPublicKey, transportSuite } =
                req.body;
            const voterName = req.body.voterName.trim();
            const { voterToken } = req.body;
            const { pollId } = req.params;
            const serializedDeviceRecord = serializeParticipantDeviceRecord({
                authPublicKey,
                transportPublicKey,
                transportSuite,
            });

            try {
                if (!voterName) {
                    throw createError(400, 'Voter name is required.');
                }

                const voterTokenHash = hashSecureToken(voterToken);

                const response = await withTransaction(fastify, async (tx) => {
                    const poll = await lockPollById(tx, pollId);
                    if (!poll) {
                        throw createError(
                            404,
                            `Poll with ID ${pollId} does not exist.`,
                        );
                    }

                    if (
                        req.body.creatorToken &&
                        poll.creatorTokenHash !==
                            hashSecureToken(req.body.creatorToken)
                    ) {
                        throw createError(
                            403,
                            ERROR_MESSAGES.invalidCreatorToken,
                        );
                    }

                    const existingRegistration = await getExistingRegistration({
                        pollId,
                        tx,
                        voterTokenHash,
                    });

                    if (existingRegistration) {
                        if (existingRegistration.voterName !== voterName) {
                            throw createError(
                                409,
                                ERROR_MESSAGES.voterTokenConflict,
                            );
                        }

                        await reconcileExistingParticipantDeviceRecord({
                            authPublicKey,
                            existingRegistration,
                            pollId,
                            serializedDeviceRecord,
                            transportPublicKey,
                            transportSuite,
                            tx,
                        });

                        return {
                            message: 'Voter registered successfully',
                            voterIndex: existingRegistration.voterIndex,
                            voterName,
                            pollId,
                            voterToken,
                        } satisfies RegisterResponse;
                    }

                    if (!poll.isOpen) {
                        throw createError(400, ERROR_MESSAGES.pollClosed);
                    }

                    const voterCount = await countPollVoters(tx, pollId);

                    if (voterCount >= maxPollParticipants) {
                        throw createError(
                            400,
                            ERROR_MESSAGES.maxParticipantsReached,
                        );
                    }

                    const voterIndex = voterCount + 1;
                    const insertedVoters = await tx
                        .insert(voters)
                        .values({
                            voterName,
                            voterIndex,
                            pollId,
                            voterTokenHash,
                        })
                        .returning({
                            id: voters.id,
                        });

                    const voterId = insertedVoters[0]?.id;

                    if (!voterId) {
                        throw createError(
                            500,
                            'Voter registration could not be stored.',
                        );
                    }

                    await tx.insert(publicKeyShares).values({
                        pollId,
                        publicKeyShare: serializedDeviceRecord,
                        voterId,
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
                void maybeDropTestResponseAfterCommit({
                    reply,
                    request: req,
                });
                return response;
            } catch (error) {
                if (
                    isConstraintViolation(error, 'unique_voter_name_per_poll')
                ) {
                    throw createError(409, ERROR_MESSAGES.duplicateVoterName);
                }

                if (
                    isConstraintViolation(
                        error,
                        'unique_voter_token_hash_per_poll',
                    )
                ) {
                    const voterTokenHash = hashSecureToken(voterToken);
                    const response = await withTransaction(
                        fastify,
                        async (tx) => {
                            const existingRegistration =
                                await getExistingRegistration({
                                    pollId,
                                    tx,
                                    voterTokenHash,
                                });

                            if (existingRegistration?.voterName !== voterName) {
                                throw createError(
                                    409,
                                    ERROR_MESSAGES.voterTokenConflict,
                                );
                            }

                            await reconcileExistingParticipantDeviceRecord({
                                authPublicKey,
                                existingRegistration,
                                pollId,
                                serializedDeviceRecord,
                                transportPublicKey,
                                transportSuite,
                                tx,
                            });

                            return {
                                message: 'Voter registered successfully',
                                voterIndex: existingRegistration.voterIndex,
                                voterName: existingRegistration.voterName,
                                pollId,
                                voterToken,
                            } satisfies RegisterResponse;
                        },
                    );

                    void reply.code(201);
                    void maybeDropTestResponseAfterCommit({
                        reply,
                        request: req,
                    });
                    return response;
                }

                throw error;
            }
        },
    );
};
