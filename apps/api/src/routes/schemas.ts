import { Type, type Static } from '@sinclair/typebox';

const ProtocolMessageTypeSchema = Type.Union([
    Type.Literal('manifest-publication'),
    Type.Literal('registration'),
    Type.Literal('manifest-acceptance'),
    Type.Literal('phase-checkpoint'),
    Type.Literal('pedersen-commitment'),
    Type.Literal('encrypted-dual-share'),
    Type.Literal('complaint'),
    Type.Literal('complaint-resolution'),
    Type.Literal('feldman-commitment'),
    Type.Literal('feldman-share-reveal'),
    Type.Literal('key-derivation-confirmation'),
    Type.Literal('ballot-submission'),
    Type.Literal('ballot-close'),
    Type.Literal('decryption-share'),
    Type.Literal('tally-publication'),
    Type.Literal('ceremony-restart'),
]);

const ProtocolPayloadSchema = Type.Object(
    {
        sessionId: Type.String({
            minLength: 64,
            maxLength: 64,
            pattern: '^[A-Fa-f0-9]{64}$',
        }),
        manifestHash: Type.String({
            minLength: 64,
            maxLength: 64,
            pattern: '^[A-Fa-f0-9]{64}$',
        }),
        phase: Type.Integer({ minimum: 0 }),
        participantIndex: Type.Integer({ minimum: 1 }),
        messageType: ProtocolMessageTypeSchema,
    },
    {
        additionalProperties: true,
    },
);

export const PollIdParamsSchema = Type.Object({
    pollId: Type.String({ format: 'uuid' }),
});

export type PollIdParams = Static<typeof PollIdParamsSchema>;

export const PollRefParamsSchema = Type.Object({
    pollRef: Type.String({ minLength: 1 }),
});

export type PollRefParams = Static<typeof PollRefParamsSchema>;

export const SignedPayloadSchema = Type.Object(
    {
        payload: ProtocolPayloadSchema,
        signature: Type.String({
            minLength: 2,
            maxLength: 8192,
            pattern: '^(?:[A-Fa-f0-9]{2})+$',
        }),
    },
    {
        additionalProperties: false,
    },
);

export const BoardMessageRecordSchema = Type.Object({
    id: Type.String(),
    createdAt: Type.String(),
    phase: Type.Integer({ minimum: 0 }),
    participantIndex: Type.Integer({ minimum: 1 }),
    messageType: ProtocolMessageTypeSchema,
    slotKey: Type.String(),
    unsignedHash: Type.String(),
    previousEntryHash: Type.Union([Type.String(), Type.Null()]),
    entryHash: Type.String(),
    classification: Type.Union([
        Type.Literal('accepted'),
        Type.Literal('idempotent'),
        Type.Literal('equivocation'),
    ]),
    signedPayload: SignedPayloadSchema,
});

export const SecureTokenSchema = Type.String({
    minLength: 64,
    maxLength: 64,
    pattern: '^[A-Fa-f0-9]{64}$',
});

export const MessageResponseSchema = Type.Object({
    message: Type.String(),
});
