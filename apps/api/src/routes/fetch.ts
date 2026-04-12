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

const nonNegativeIntegerSchema = Type.Integer({ minimum: 0 });
const positiveIntegerSchema = Type.Integer({ minimum: 1 });

const PollRosterParticipantSchema = Type.Object({
    ceremonyState: Type.Union([
        Type.Literal('active'),
        Type.Literal('blocking'),
        Type.Literal('skipped'),
    ]),
    deviceReady: Type.Boolean(),
    voterIndex: Type.Integer({ minimum: 1 }),
    voterName: Type.String(),
});

const PollRosterEntrySchema = Type.Object({
    authPublicKey: Type.String(),
    participantIndex: Type.Integer({ minimum: 1 }),
    transportPublicKey: Type.String(),
    transportSuite: Type.Literal('X25519'),
    voterName: Type.String(),
});

const ElectionManifestSchema = Type.Object({
    optionList: Type.Array(Type.String()),
    rosterHash: Type.String(),
});

export const PollResponseSchema = Type.Object({
    id: Type.String(),
    slug: Type.String(),
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(PollRosterParticipantSchema),
    isOpen: Type.Boolean(),
    manifest: Type.Union([ElectionManifestSchema, Type.Null()]),
    manifestHash: Type.Union([Type.String(), Type.Null()]),
    sessionId: Type.Union([Type.String(), Type.Null()]),
    sessionFingerprint: Type.Union([Type.String(), Type.Null()]),
    phase: Type.Union([
        Type.Literal('open'),
        Type.Literal('securing'),
        Type.Literal('ready-to-reveal'),
        Type.Literal('revealing'),
        Type.Literal('complete'),
        Type.Literal('aborted'),
    ]),
    submittedParticipantCount: nonNegativeIntegerSchema,
    minimumCloseParticipantCount: positiveIntegerSchema,
    ceremony: Type.Object({
        acceptedDecryptionShareCount: nonNegativeIntegerSchema,
        acceptedEncryptedBallotCount: nonNegativeIntegerSchema,
        acceptedRegistrationCount: nonNegativeIntegerSchema,
        activeParticipantCount: nonNegativeIntegerSchema,
        blockingParticipantIndices: Type.Array(Type.Integer({ minimum: 1 })),
        completeEncryptedBallotParticipantCount: nonNegativeIntegerSchema,
        revealReady: Type.Boolean(),
        restartCount: nonNegativeIntegerSchema,
    }),
    boardAudit: Type.Object({
        acceptedCount: nonNegativeIntegerSchema,
        duplicateCount: nonNegativeIntegerSchema,
        equivocationCount: nonNegativeIntegerSchema,
        ceremonyDigest: Type.Union([Type.String(), Type.Null()]),
        phaseDigests: Type.Array(
            Type.Object({
                phase: nonNegativeIntegerSchema,
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
        qualParticipantIndices: Type.Array(positiveIntegerSchema),
        verifiedOptionTallies: Type.Array(
            Type.Object({
                optionIndex: positiveIntegerSchema,
                tally: Type.String(),
                mean: Type.Number(),
                acceptedBallotCount: nonNegativeIntegerSchema,
            }),
        ),
    }),
    boardEntries: Type.Array(BoardMessageRecordSchema),
    rosterEntries: Type.Array(PollRosterEntrySchema),
    thresholds: Type.Object({
        reconstructionThreshold: Type.Union([
            positiveIntegerSchema,
            Type.Null(),
        ]),
        minimumPublishedVoterCount: Type.Union([
            positiveIntegerSchema,
            Type.Null(),
        ]),
        maxParticipants: positiveIntegerSchema,
        validationTarget: positiveIntegerSchema,
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
