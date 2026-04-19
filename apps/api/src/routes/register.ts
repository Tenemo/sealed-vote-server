import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import type {
    RegisterVoterRequest as RegisterVoterRequestContract,
    RegisterVoterResponse as RegisterVoterResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { count, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import type { DatabaseTransaction } from '../database/client.js';
import { publicKeyShares, voters } from '../database/schema.js';
import { isConstraintViolation, withTransaction } from '../utils/database.js';
import { maximumPollVoterCount } from '../utils/poll-limits.js';
import { lockPollById } from '../utils/poll-locks.js';
import {
    parseVoterDeviceRecord,
    serializeVoterDeviceRecord,
} from '../utils/voter-device-records.js';
import { maybeDropTestResponseAfterCommit } from '../utils/testing.js';
import { hashSecureToken } from '../utils/voter-auth.js';

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

const countPollVoters = async (
    databaseTransaction: DatabaseTransaction,
    pollId: string,
): Promise<number> => {
    const [row] = await databaseTransaction
        .select({ count: count() })
        .from(voters)
        .where(eq(voters.pollId, pollId));

    return row?.count ?? 0;
};

const getExistingRegistration = async ({
    pollId,
    databaseTransaction,
    voterTokenHash,
}: {
    pollId: string;
    databaseTransaction: DatabaseTransaction;
    voterTokenHash: string;
}): Promise<ExistingRegistration | undefined> =>
    await databaseTransaction.query.voters.findFirst({
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

const hasMatchingVoterDeviceRecord = ({
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

const reconcileExistingVoterDeviceRecord = async ({
    authPublicKey,
    existingRegistration,
    pollId,
    serializedDeviceRecord,
    transportPublicKey,
    transportSuite,
    databaseTransaction,
}: {
    authPublicKey: string;
    existingRegistration: ExistingRegistration;
    pollId: string;
    serializedDeviceRecord: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
    databaseTransaction: DatabaseTransaction;
}): Promise<void> => {
    const existingPublicKeyShare = existingRegistration.publicKeyShares[0];
    const existingDeviceRecord = parseVoterDeviceRecord(
        existingPublicKeyShare?.publicKeyShare,
    );

    if (existingDeviceRecord) {
        if (
            !hasMatchingVoterDeviceRecord({
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
        await databaseTransaction.insert(publicKeyShares).values({
            pollId,
            publicKeyShare: serializedDeviceRecord,
            voterId: existingRegistration.id,
        });
        return;
    }

    await databaseTransaction
        .update(publicKeyShares)
        .set({
            publicKeyShare: serializedDeviceRecord,
        })
        .where(eq(publicKeyShares.id, existingPublicKeyShare.id));
};

export const registerVoter = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/register',
        { schema },
        async (
            request: FastifyRequest<{
                Body: RegisterRequest;
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<RegisterResponse> => {
            const { authPublicKey, transportPublicKey, transportSuite } =
                request.body;
            const voterName = request.body.voterName.trim();
            const { voterToken } = request.body;
            const { pollId } = request.params;
            const serializedDeviceRecord = serializeVoterDeviceRecord({
                authPublicKey,
                transportPublicKey,
                transportSuite,
            });

            try {
                if (!voterName) {
                    throw createError(400, 'Voter name is required.');
                }

                const voterTokenHash = hashSecureToken(voterToken);

                const response = await withTransaction(
                    fastify,
                    async (databaseTransaction) => {
                        const poll = await lockPollById(
                            databaseTransaction,
                            pollId,
                        );
                        if (!poll) {
                            throw createError(
                                404,
                                `Poll with ID ${pollId} does not exist.`,
                            );
                        }

                        if (
                            request.body.creatorToken &&
                            poll.creatorTokenHash !==
                                hashSecureToken(request.body.creatorToken)
                        ) {
                            throw createError(
                                403,
                                ERROR_MESSAGES.invalidCreatorToken,
                            );
                        }

                        const existingRegistration =
                            await getExistingRegistration({
                                pollId,
                                databaseTransaction,
                                voterTokenHash,
                            });

                        if (existingRegistration) {
                            if (existingRegistration.voterName !== voterName) {
                                throw createError(
                                    409,
                                    ERROR_MESSAGES.voterTokenConflict,
                                );
                            }

                            await reconcileExistingVoterDeviceRecord({
                                authPublicKey,
                                existingRegistration,
                                pollId,
                                serializedDeviceRecord,
                                transportPublicKey,
                                transportSuite,
                                databaseTransaction,
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

                        const voterCount = await countPollVoters(
                            databaseTransaction,
                            pollId,
                        );

                        if (voterCount >= maximumPollVoterCount) {
                            throw createError(
                                400,
                                ERROR_MESSAGES.maximumVoterCountReached,
                            );
                        }

                        const voterIndex = voterCount + 1;
                        const insertedVoters = await databaseTransaction
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

                        await databaseTransaction
                            .insert(publicKeyShares)
                            .values({
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
                    },
                );

                void reply.code(201);
                void maybeDropTestResponseAfterCommit({
                    reply,
                    request: request,
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
                        async (databaseTransaction) => {
                            const existingRegistration =
                                await getExistingRegistration({
                                    pollId,
                                    databaseTransaction,
                                    voterTokenHash,
                                });

                            if (existingRegistration?.voterName !== voterName) {
                                throw createError(
                                    409,
                                    ERROR_MESSAGES.voterTokenConflict,
                                );
                            }

                            await reconcileExistingVoterDeviceRecord({
                                authPublicKey,
                                existingRegistration,
                                pollId,
                                serializedDeviceRecord,
                                transportPublicKey,
                                transportSuite,
                                databaseTransaction,
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
                        request: request,
                    });
                    return response;
                }

                throw error;
            }
        },
    );
};
