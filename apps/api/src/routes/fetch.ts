import type { PollResponse as PollResponseContract } from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { getPollFetchReadModel } from '../utils/pollReadModel.js';

import {
    BoardMessageRecordSchema,
    PollRefParamsSchema,
    type PollRefParams,
} from './schemas.js';

const PollRosterParticipantSchema = Type.Object({
    voterIndex: Type.Number(),
    voterName: Type.String(),
});

const PollResponseSchema = Type.Object({
    id: Type.String(),
    slug: Type.String(),
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(PollRosterParticipantSchema),
    isOpen: Type.Boolean(),
    manifest: Type.Union([Type.Any(), Type.Null()]),
    manifestHash: Type.Union([Type.String(), Type.Null()]),
    sessionId: Type.Union([Type.String(), Type.Null()]),
    sessionFingerprint: Type.Union([Type.String(), Type.Null()]),
    phase: Type.Union([
        Type.Literal('registration'),
        Type.Literal('setup'),
        Type.Literal('ballot'),
        Type.Literal('decryption'),
        Type.Literal('complete'),
        Type.Literal('aborted'),
    ]),
    boardAudit: Type.Object({
        acceptedCount: Type.Number(),
        duplicateCount: Type.Number(),
        equivocationCount: Type.Number(),
        ceremonyDigest: Type.Union([Type.String(), Type.Null()]),
        phaseDigests: Type.Array(
            Type.Object({
                phase: Type.Number(),
                digest: Type.String(),
            }),
        ),
    }),
    verification: Type.Object({
        status: Type.Union([
            Type.Literal('not-ready'),
            Type.Literal('verified'),
            Type.Literal('invalid'),
        ]),
        reason: Type.Union([Type.String(), Type.Null()]),
        qualParticipantIndices: Type.Array(Type.Number()),
        verifiedOptionTallies: Type.Array(
            Type.Object({
                optionIndex: Type.Number(),
                tally: Type.String(),
                mean: Type.Number(),
                acceptedBallotCount: Type.Number(),
            }),
        ),
    }),
    boardEntries: Type.Array(BoardMessageRecordSchema),
    thresholds: Type.Object({
        reconstructionThreshold: Type.Union([Type.Number(), Type.Null()]),
        minimumPublishedVoterCount: Type.Union([Type.Number(), Type.Null()]),
        suggestedReconstructionThreshold: Type.Number(),
        maxParticipants: Type.Number(),
        validationTarget: Type.Number(),
    }),
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
