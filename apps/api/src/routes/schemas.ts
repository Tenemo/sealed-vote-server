import { Type, type Static } from '@sinclair/typebox';

export const PollIdParamsSchema = Type.Object({
    pollId: Type.String({ format: 'uuid' }),
});

export type PollIdParams = Static<typeof PollIdParamsSchema>;

export const PollRefParamsSchema = Type.Object({
    pollRef: Type.String({ minLength: 1 }),
});

export type PollRefParams = Static<typeof PollRefParamsSchema>;

export const EncryptedMessageSchema = Type.Object({
    c1: Type.String(),
    c2: Type.String(),
});

export const SecureTokenSchema = Type.String({
    minLength: 64,
    maxLength: 64,
    pattern: '^[A-Fa-f0-9]{64}$',
});

export const MessageResponseSchema = Type.Object({
    message: Type.String(),
});
