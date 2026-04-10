import { Type, type Static } from '@sinclair/typebox';

export const PollIdParamsSchema = Type.Object({
    pollId: Type.String({ format: 'uuid' }),
});

export type PollIdParams = Static<typeof PollIdParamsSchema>;

export const PollRefParamsSchema = Type.Object({
    pollRef: Type.String({ minLength: 1 }),
});

export type PollRefParams = Static<typeof PollRefParamsSchema>;

export const SignedPayloadSchema = Type.Any();

export const BoardMessageRecordSchema = Type.Object({
    id: Type.String(),
    createdAt: Type.String(),
    phase: Type.Number(),
    participantIndex: Type.Number(),
    messageType: Type.String(),
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
