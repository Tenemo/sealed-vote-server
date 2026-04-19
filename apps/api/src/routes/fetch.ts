import {
    fixedScoreRange,
    type PollResponse as PollResponseContract,
} from '@sealed-vote/contracts';
import { Type } from '@sinclair/typebox';
import { FastifyInstance, FastifyRequest } from 'fastify';
import createError from 'http-errors';

import { getPollFetchReadModel } from '../utils/poll-read-model.js';

import {
    BoardMessageRecordSchema,
    PollReferenceParamsSchema,
    type PollReferenceParams,
} from './schemas.js';

const nonNegativeIntegerSchema = Type.Integer({ minimum: 0 });
const positiveIntegerSchema = Type.Integer({ minimum: 1 });

const PollRosterVoterSchema = Type.Object({
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
    scoreRange: Type.Object({
        min: Type.Integer({
            minimum: fixedScoreRange.min,
            maximum: fixedScoreRange.min,
        }),
        max: Type.Integer({
            minimum: fixedScoreRange.max,
            maximum: fixedScoreRange.max,
        }),
    }),
});

export const PollResponseSchema = Type.Object({
    id: Type.String({ format: 'uuid' }),
    slug: Type.String(),
    pollName: Type.String(),
    createdAt: Type.String(),
    choices: Type.Array(Type.String()),
    voters: Type.Array(PollRosterVoterSchema),
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
    submittedVoterCount: nonNegativeIntegerSchema,
    minimumCloseVoterCount: positiveIntegerSchema,
    ceremony: Type.Object({
        acceptedDecryptionShareCount: nonNegativeIntegerSchema,
        acceptedEncryptedBallotCount: nonNegativeIntegerSchema,
        acceptedRegistrationCount: nonNegativeIntegerSchema,
        activeParticipantCount: nonNegativeIntegerSchema,
        blockingVoterIndices: Type.Array(Type.Integer({ minimum: 1 })),
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
        maximumVoterCount: positiveIntegerSchema,
        validationTarget: positiveIntegerSchema,
    }),
});

const schema = {
    params: PollReferenceParamsSchema,
    response: {
        200: PollResponseSchema,
    },
};

type PollResponse = PollResponseContract;

export const fetchPoll = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get(
        '/polls/:pollReference',
        { schema },
        async (
            request: FastifyRequest<{ Params: PollReferenceParams }>,
        ): Promise<PollResponse> => {
            const poll = await getPollFetchReadModel(
                fastify.database,
                request.params.pollReference,
            );

            if (!poll) {
                throw createError(
                    404,
                    `Poll ${request.params.pollReference} does not exist.`,
                );
            }

            return poll;
        },
    );
};
