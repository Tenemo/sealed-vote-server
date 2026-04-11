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
    importAuthPublicKey,
    validateElectionManifest,
    type ManifestPublicationPayload,
    type ProtocolMessageType,
    type RegistrationPayload,
    type SignedPayload,
    verifyPayloadSignature,
} from 'threshold-elgamal';

import type { DatabaseTransaction } from '../db/client.js';
import { boardMessages } from '../db/schema.js';
import {
    boardMessageSlotKey,
    classifyBoardMessageRow,
    classifyBoardMessages,
    getLastBoardEntryHash,
    getBoardMessageRows,
    getBoardMessageSlotRows,
    nextEntryHash,
    unsignedPayloadHash,
} from '../utils/boardMessages.js';
import { withTransaction } from '../utils/db.js';
import { lockPollById } from '../utils/pollLocks.js';
import { parseParticipantDeviceRecord } from '../utils/participantDevices.js';
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
        400: MessageResponseSchema,
        404: MessageResponseSchema,
    },
};

type BoardMessageRequest = BoardMessageRequestContract;
type BoardMessageRecord = BoardMessageRecordContract;
type BoardMessagesResponse = BoardMessagesResponseContract;
type BoardMessagesQuery = {
    afterEntryHash?: string;
};

const HEX_64_PATTERN = /^[A-Fa-f0-9]{64}$/;
const protocolMessageTypes: readonly ProtocolMessageType[] = [
    'manifest-publication',
    'registration',
    'manifest-acceptance',
    'phase-checkpoint',
    'pedersen-commitment',
    'encrypted-dual-share',
    'complaint',
    'complaint-resolution',
    'feldman-commitment',
    'feldman-share-reveal',
    'key-derivation-confirmation',
    'ballot-submission',
    'decryption-share',
    'tally-publication',
    'ceremony-restart',
];
const protocolMessageTypeSet = new Set<string>(protocolMessageTypes);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isHex64 = (value: unknown): value is string =>
    typeof value === 'string' && HEX_64_PATTERN.test(value);

const isProtocolMessageType = (value: unknown): value is ProtocolMessageType =>
    typeof value === 'string' && protocolMessageTypeSet.has(value);

const validateBoardPayloadShape = (
    signedPayload: BoardMessageRequest['signedPayload'],
): SignedPayload => {
    if (!isRecord(signedPayload) || !isRecord(signedPayload.payload)) {
        throw createError(400, ERROR_MESSAGES.boardMessagePayloadInvalid);
    }

    const { payload } = signedPayload;

    if (
        !isHex64(payload.sessionId) ||
        !isHex64(payload.manifestHash) ||
        !Number.isInteger(payload.phase) ||
        payload.phase < 0 ||
        !Number.isInteger(payload.participantIndex) ||
        payload.participantIndex < 1 ||
        !isProtocolMessageType(payload.messageType)
    ) {
        throw createError(400, ERROR_MESSAGES.boardMessagePayloadInvalid);
    }

    if (
        payload.messageType === 'registration' &&
        (!isHex64(payload.rosterHash) ||
            typeof payload.authPublicKey !== 'string' ||
            payload.authPublicKey.length === 0 ||
            typeof payload.transportPublicKey !== 'string' ||
            payload.transportPublicKey.length === 0)
    ) {
        throw createError(400, ERROR_MESSAGES.boardMessagePayloadInvalid);
    }

    if (
        payload.messageType === 'manifest-publication' &&
        !isRecord(payload.manifest)
    ) {
        throw createError(400, ERROR_MESSAGES.boardMessagePayloadInvalid);
    }

    return signedPayload as SignedPayload;
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

const assertStoredRegistrationKeysMatchPayload = async ({
    pollId,
    signedPayload,
    tx,
    voterId,
}: {
    pollId: string;
    signedPayload: SignedPayload<RegistrationPayload>;
    tx: DatabaseTransaction;
    voterId: string;
}): Promise<void> => {
    const voterRecord = await tx.query.voters.findFirst({
        where: (fields, { and: andOperator, eq: isEqual }) =>
            andOperator(
                isEqual(fields.id, voterId),
                isEqual(fields.pollId, pollId),
            ),
        columns: {
            id: true,
        },
        with: {
            publicKeyShares: {
                columns: {
                    publicKeyShare: true,
                },
            },
        },
    });

    const deviceRecord = parseParticipantDeviceRecord(
        voterRecord?.publicKeyShares[0]?.publicKeyShare,
    );

    if (!deviceRecord) {
        throw createError(
            400,
            'The participant must complete device setup before publishing a board registration payload.',
        );
    }

    if (
        deviceRecord.authPublicKey !== signedPayload.payload.authPublicKey ||
        deviceRecord.transportPublicKey !==
            signedPayload.payload.transportPublicKey
    ) {
        throw createError(
            400,
            'The published registration payload does not match the participant device keys registered with the poll.',
        );
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
            if (req.query.afterEntryHash) {
                const startIndex = classified.records.findIndex(
                    (record) => record.entryHash === req.query.afterEntryHash,
                );

                if (startIndex < 0) {
                    throw createError(
                        400,
                        ERROR_MESSAGES.boardMessageCursorInvalid,
                    );
                }

                return {
                    pollId: poll.id,
                    messages: classified.records.slice(startIndex + 1),
                };
            }

            return {
                pollId: poll.id,
                messages: classified.records,
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
            const signedPayload = validateBoardPayloadShape(
                req.body.signedPayload,
            );

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
                    await assertStoredRegistrationKeysMatchPayload({
                        pollId: poll.id,
                        signedPayload,
                        tx,
                        voterId: authenticatedVoter.id,
                    });
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
                        pollId: boardMessages.pollId,
                        participantIndex: boardMessages.participantIndex,
                        phase: boardMessages.phase,
                        messageType: boardMessages.messageType,
                        slotKey: boardMessages.slotKey,
                        unsignedHash: boardMessages.unsignedHash,
                        previousEntryHash: boardMessages.previousEntryHash,
                        entryHash: boardMessages.entryHash,
                        signedPayload: boardMessages.signedPayload,
                        createdAt: boardMessages.createdAt,
                    });

                const insertedRow = inserted[0];
                if (!insertedRow) {
                    throw createError(500, 'Board message was not stored.');
                }

                const slotRows = await getBoardMessageSlotRows(
                    tx,
                    poll.id,
                    slotKey,
                );

                return classifyBoardMessageRow(insertedRow, slotRows);
            });

            void reply.code(201);
            return response;
        },
    );
};
