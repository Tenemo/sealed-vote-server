import type { PollResponse as PollResponseContract } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { getPollFetchReadModel } from '../utils/pollReadModel.js';

import {
    EncryptedMessageSchema,
    PollRefParamsSchema,
    type PollRefParams,
} from './schemas.js';

const PollResponseSchema = Type.Object({
    id: Type.String(),
    slug: Type.String(),
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(Type.String()),
    isOpen: Type.Boolean(),
    publicKeyShareCount: Type.Number(),
    encryptedVoteCount: Type.Number(),
    decryptionShareCount: Type.Number(),
    commonPublicKey: Type.Union([Type.String(), Type.Null()]),
    encryptedTallies: Type.Array(EncryptedMessageSchema),
    publishedDecryptionShares: Type.Array(Type.Array(Type.String())),
    resultTallies: Type.Array(Type.String()),
    resultScores: Type.Array(Type.Number()),
});

const schema = {
    params: PollRefParamsSchema,
    response: {
        200: PollResponseSchema,
    },
};

export type PollResponse = PollResponseContract;

export const fetch = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollRef',
        { schema },
        async (
            req: FastifyRequest<{ Params: PollRefParams }>,
        ): Promise<PollResponse> => {
            const poll = await getPollFetchReadModel(
                fastify.db,
                req.params.pollRef,
            );

            if (!poll) {
                throw createError(
                    404,
                    `Poll ${req.params.pollRef} does not exist.`,
                );
            }

            return poll;
        },
    );
};
