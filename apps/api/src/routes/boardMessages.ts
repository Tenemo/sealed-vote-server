import {
    ERROR_MESSAGES,
    type BoardMessageRecord as BoardMessageRecordContract,
    type BoardMessageRequest as BoardMessageRequestContract,
    type BoardMessagesResponse as BoardMessagesResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import {
    canonicalUnsignedPayloadBytes,
    hashElectionManifest,
    hashRosterEntries,
    validateElectionManifest,
    type ManifestPublicationPayload,
    type RegistrationPayload,
    type SignedPayload,
} from 'threshold-elgamal/protocol';
import {
    importAuthPublicKey,
    verifyPayloadSignature,
} from 'threshold-elgamal/transport';

import type { DatabaseTransaction } from '../db/client.js';
import { boardMessages } from '../db/schema.js';
import {
    boardMessageSlotKey,
    classifyBoardMessages,
    getBoardMessageRows,
    getLastBoardEntryHash,
    nextEntryHash,
    unsignedPayloadHash,
} from '../utils/boardMessages.js';
import { withTransaction } from '../utils/db.js';
import { lockPollById } from '../utils/pollLocks.js';
import {
    findAcceptedRegistrationPayload,
    getAcceptedManifestPublication,
} from '../utils/pollReadModel.js';
import { authenticateVoter } from '../utils/voterAuth.js';

import {
    BoardMessageRecordSchema,
    MessageResponseSchema,
    PollIdParamsSchema,
    SecureTokenSchema,
    SignedPayloadSchema,
    type PollIdParams,
} from './schemas.js';

const BoardMessageRequestSchema = Type.Object({
    voterToken: SecureTokenSchema,
    signedPayload: SignedPayloadSchema,
});

const BoardMessagesQuerySchema = Type.Object({
    afterEntryHash: Type.Optional(
        Type.String({ minLength: 64, maxLength: 64 }),
    ),
});

const BoardMessagesResponseSchema = Type.Object({
    pollId: Type.String(),
    messages: Type.Array(BoardMessageRecordSchema),
});

const schema = {
    params: PollIdParamsSchema,
    body: BoardMessageRequestSchema,
    response: {
        201: BoardMessageRecordSchema,
        400: MessageResponseSchema,
        403: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

const fetchSchema = {
    params: PollIdParamsSchema,
    querystring: BoardMessagesQuerySchema,
    response: {
        200: BoardMessagesResponseSchema,
        404: MessageResponseSchema,
    },
};

type BoardMessageRequest = BoardMessageRequestContract;
type BoardMessageRecord = BoardMessageRecordContract;
type BoardMessagesResponse = BoardMessagesResponseContract;
type BoardMessagesQuery = {
    afterEntryHash?: string;
};

const isRegistrationPayload = (
    signedPayload: SignedPayload,
): signedPayload is SignedPayload<RegistrationPayload> =>
    signedPayload.payload.messageType === 'registration';

const isManifestPublicationPayload = (
    signedPayload: SignedPayload,
): signedPayload is SignedPayload<ManifestPublicationPayload> =>
    signedPayload.payload.messageType === 'manifest-publication';

const verifyRegistrationPayloadSignature = async (
    signedPayload: SignedPayload<RegistrationPayload>,
): Promise<void> => {
    const publicKey = await importAuthPublicKey(
        signedPayload.payload.authPublicKey,
    );
    const verified = await verifyPayloadSignature(
        publicKey,
        canonicalUnsignedPayloadBytes(signedPayload.payload),
        signedPayload.signature,
    );

    if (!verified) {
        throw createError(400, 'Registration payload signature is invalid.');
    }
};

const verifyParticipantPayloadSignature = async ({
    pollId,
    signedPayload,
    tx,
}: {
    pollId: string;
    signedPayload: SignedPayload;
    tx: DatabaseTransaction;
}): Promise<void> => {
    const registrationPayload = await findAcceptedRegistrationPayload(
        tx,
        pollId,
        signedPayload.payload.participantIndex,
    );

    if (!registrationPayload) {
        throw createError(
            400,
            'Participant registration must be accepted before later protocol messages can be posted.',
        );
    }

    const publicKey = await importAuthPublicKey(
        registrationPayload.payload.authPublicKey,
    );
    const verified = await verifyPayloadSignature(
        publicKey,
        canonicalUnsignedPayloadBytes(signedPayload.payload),
        signedPayload.signature,
    );

    if (!verified) {
        throw createError(400, 'Protocol payload signature is invalid.');
    }
};

const verifyManifestPublicationPayload = async ({
    choiceNames,
    participantCount,
    poll,
    signedPayload,
    tx,
}: {
    choiceNames: readonly string[];
    participantCount: number;
    poll: Awaited<ReturnType<typeof lockPollById>>;
    signedPayload: SignedPayload<ManifestPublicationPayload>;
    tx: DatabaseTransaction;
}): Promise<void> => {
    if (!poll) {
        throw createError(404, 'Poll does not exist.');
    }

    const classifiedBoard = await classifyBoardMessages(
        await getBoardMessageRows(tx, poll.id),
    );
    const acceptedRegistrations = classifiedBoard.acceptedPayloads.filter(
        isRegistrationPayload,
    );

    if (acceptedRegistrations.length !== participantCount) {
        throw createError(
            400,
            'Registration payloads must be posted for the full frozen roster before the manifest can be published.',
        );
    }

    const rosterHash = await hashRosterEntries(
        acceptedRegistrations.map((registration) => ({
            participantIndex: registration.payload.participantIndex,
            authPublicKey: registration.payload.authPublicKey,
            transportPublicKey: registration.payload.transportPublicKey,
        })),
    );
    const manifest = validateElectionManifest(signedPayload.payload.manifest);
    const manifestHash = await hashElectionManifest(manifest);
    const expectedThreshold =
        poll.requestedReconstructionThreshold ??
        Math.floor(participantCount / 2) + 1;
    const expectedMinimumPublishedVoterCount =
        poll.requestedMinimumPublishedVoterCount ?? expectedThreshold + 1;

    if (signedPayload.payload.manifestHash !== manifestHash) {
        throw createError(
            400,
            'Manifest hash does not match the published manifest body.',
        );
    }

    if (manifest.rosterHash !== rosterHash) {
        throw createError(
            400,
            'Manifest roster hash does not match the accepted registration roster.',
        );
    }

    if (manifest.protocolVersion !== poll.protocolVersion) {
        throw createError(
            400,
            'Manifest protocol version does not match the poll configuration.',
        );
    }

    if (manifest.participantCount !== participantCount) {
        throw createError(
            400,
            'Manifest participant count does not match the frozen roster.',
        );
    }

    if (manifest.reconstructionThreshold !== expectedThreshold) {
        throw createError(
            400,
            'Manifest reconstruction threshold does not match the poll configuration.',
        );
    }

    if (
        manifest.minimumPublishedVoterCount !==
        expectedMinimumPublishedVoterCount
    ) {
        throw createError(
            400,
            'Manifest minimum published voter count does not match the poll configuration.',
        );
    }

    if (JSON.stringify(manifest.optionList) !== JSON.stringify(choiceNames)) {
        throw createError(
            400,
            'Manifest option list does not match the poll choices.',
        );
    }
};

const ensurePayloadMatchesPublishedManifest = async ({
    pollId,
    signedPayload,
    tx,
}: {
    pollId: string;
    signedPayload: SignedPayload;
    tx: DatabaseTransaction;
}): Promise<void> => {
    const manifestPublication = await getAcceptedManifestPublication(
        tx,
        pollId,
    );

    if (!manifestPublication) {
        throw createError(
            400,
            'Manifest publication must be accepted before this message type can be posted.',
        );
    }

    if (
        signedPayload.payload.sessionId !==
        manifestPublication.payload.sessionId
    ) {
        throw createError(
            400,
            'Payload session ID does not match the poll session.',
        );
    }

    if (
        signedPayload.payload.manifestHash !==
        manifestPublication.payload.manifestHash
    ) {
        throw createError(
            400,
            'Payload manifest hash does not match the published manifest.',
        );
    }
};

const toBoardMessageRecord = async ({
    pollId,
    recordId,
    tx,
}: {
    pollId: string;
    recordId: string;
    tx: DatabaseTransaction;
}): Promise<BoardMessageRecord> => {
    const rows = await getBoardMessageRows(tx, pollId);
    const classified = await classifyBoardMessages(rows);
    const record = classified.records.find((item) => item.id === recordId);

    if (!record) {
        throw createError(500, 'Stored board message could not be reloaded.');
    }

    return record;
};

export const boardMessageRoutes = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.get(
        '/polls/:pollId/board/messages',
        { schema: fetchSchema },
        async (
            req: FastifyRequest<{
                Params: PollIdParams;
                Querystring: BoardMessagesQuery;
            }>,
        ): Promise<BoardMessagesResponse> => {
            const poll = await fastify.db.query.polls.findFirst({
                where: (fields, { eq: isEqual }) =>
                    isEqual(fields.id, req.params.pollId),
                columns: {
                    id: true,
                },
            });

            if (!poll) {
                throw createError(
                    404,
                    `Poll with ID ${req.params.pollId} does not exist.`,
                );
            }

            const rows = await getBoardMessageRows(fastify.db, poll.id);
            const classified = await classifyBoardMessages(rows);
            const startIndex = req.query.afterEntryHash
                ? classified.records.findIndex(
                      (record) => record.entryHash === req.query.afterEntryHash,
                  )
                : -1;

            return {
                pollId: poll.id,
                messages:
                    startIndex >= 0
                        ? classified.records.slice(startIndex + 1)
                        : classified.records,
            };
        },
    );

    fastify.post(
        '/polls/:pollId/board/messages',
        { schema },
        async (
            req: FastifyRequest<{
                Body: BoardMessageRequest;
                Params: PollIdParams;
            }>,
            reply: FastifyReply,
        ): Promise<BoardMessageRecord> => {
            if (!req.body.signedPayload?.payload) {
                throw createError(
                    400,
                    ERROR_MESSAGES.boardMessageSignatureRequired,
                );
            }

            const response = await withTransaction(fastify, async (tx) => {
                const poll = await lockPollById(tx, req.params.pollId);

                if (!poll) {
                    throw createError(
                        404,
                        `Poll with ID ${req.params.pollId} does not exist.`,
                    );
                }

                if (poll.isOpen) {
                    throw createError(
                        400,
                        'Board messages can only be posted after the poll is closed.',
                    );
                }

                const authenticatedVoter = await authenticateVoter(
                    tx,
                    poll.id,
                    req.body.voterToken,
                );
                const signedPayload = req.body.signedPayload;

                if (
                    signedPayload.payload.participantIndex !==
                    authenticatedVoter.voterIndex
                ) {
                    throw createError(
                        403,
                        ERROR_MESSAGES.boardMessageParticipantMismatch,
                    );
                }

                if (isRegistrationPayload(signedPayload)) {
                    await verifyRegistrationPayloadSignature(signedPayload);
                } else if (isManifestPublicationPayload(signedPayload)) {
                    await verifyParticipantPayloadSignature({
                        pollId: poll.id,
                        signedPayload,
                        tx,
                    });
                } else {
                    await ensurePayloadMatchesPublishedManifest({
                        pollId: poll.id,
                        signedPayload,
                        tx,
                    });
                    await verifyParticipantPayloadSignature({
                        pollId: poll.id,
                        signedPayload,
                        tx,
                    });
                }

                if (isManifestPublicationPayload(signedPayload)) {
                    const pollChoices = await tx.query.choices.findMany({
                        where: (fields, { eq: isEqual }) =>
                            isEqual(fields.pollId, poll.id),
                        columns: {
                            choiceName: true,
                        },
                        orderBy: (fields, { asc: ascending }) =>
                            ascending(fields.choiceIndex),
                    });
                    const voterCount = await tx.query.voters.findMany({
                        where: (fields, { eq: isEqual }) =>
                            isEqual(fields.pollId, poll.id),
                        columns: {
                            id: true,
                        },
                    });

                    await verifyManifestPublicationPayload({
                        choiceNames: pollChoices.map(
                            ({ choiceName }) => choiceName,
                        ),
                        participantCount: voterCount.length,
                        poll,
                        signedPayload,
                        tx,
                    });
                }

                const previousEntryHash = await getLastBoardEntryHash(
                    tx,
                    poll.id,
                );
                const slotKey = boardMessageSlotKey(signedPayload);
                const inserted = await tx
                    .insert(boardMessages)
                    .values({
                        pollId: poll.id,
                        participantIndex:
                            signedPayload.payload.participantIndex,
                        phase: signedPayload.payload.phase,
                        messageType: signedPayload.payload.messageType,
                        slotKey,
                        unsignedHash: unsignedPayloadHash(signedPayload),
                        previousEntryHash,
                        entryHash: nextEntryHash(
                            previousEntryHash,
                            signedPayload,
                        ),
                        signedPayload,
                    })
                    .returning({
                        id: boardMessages.id,
                    });

                const recordId = inserted[0]?.id;
                if (!recordId) {
                    throw createError(500, 'Board message was not stored.');
                }

                return await toBoardMessageRecord({
                    pollId: poll.id,
                    recordId,
                    tx,
                });
            });

            void reply.code(201);
            return response;
        },
    );
};
