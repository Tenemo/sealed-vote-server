import { isUuid, type PollResponse } from '@sealed-vote/contracts';
import { eq } from 'drizzle-orm';
import { majorityThreshold } from 'threshold-elgamal/core';
import {
    replayGjkrTranscript,
    verifyDKGTranscript,
} from 'threshold-elgamal/dkg';
import {
    defaultMinimumPublishedVoterCount,
    formatSessionFingerprint,
    hashElectionManifest,
    verifyElectionCeremonyDetailedResult,
    type BallotSubmissionPayload,
    type DecryptionSharePayload,
    type ElectionManifest,
    type ManifestPublicationPayload,
    type SignedPayload,
    type TallyPublicationPayload,
} from 'threshold-elgamal/protocol';

import type { Database, DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

import { classifyBoardMessages, getBoardMessageRows } from './boardMessages.js';
import { normalizeDatabaseTimestamp } from './db.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;
type PollRow = Pick<
    typeof polls.$inferSelect,
    | 'createdAt'
    | 'id'
    | 'isOpen'
    | 'pollName'
    | 'protocolVersion'
    | 'requestedMinimumPublishedVoterCount'
    | 'requestedReconstructionThreshold'
    | 'slug'
>;

const minimumSupportedParticipantCount = 3;

const getSuggestedThreshold = (participantCount: number): number =>
    participantCount >= minimumSupportedParticipantCount
        ? majorityThreshold(participantCount)
        : 2;

const getRequestedThresholdError = (
    requestedReconstructionThreshold: number | null,
    requestedMinimumPublishedVoterCount: number | null,
    participantCount: number,
): string | null => {
    if (participantCount < minimumSupportedParticipantCount) {
        return 'Strict-majority ceremonies require at least 3 participants.';
    }

    const effectiveThreshold =
        requestedReconstructionThreshold ?? majorityThreshold(participantCount);

    if (
        effectiveThreshold < majorityThreshold(participantCount) ||
        effectiveThreshold > participantCount - 1
    ) {
        return `Reconstruction threshold must stay within the strict-majority range for ${participantCount} participants.`;
    }

    if (
        requestedMinimumPublishedVoterCount !== null &&
        (requestedMinimumPublishedVoterCount < effectiveThreshold ||
            requestedMinimumPublishedVoterCount > participantCount)
    ) {
        return `Minimum published voter count must be between ${effectiveThreshold} and ${participantCount}.`;
    }

    return null;
};

const resolveThresholdSummary = (
    poll: PollRow,
    participantCount: number,
): PollResponse['thresholds'] => {
    const suggestedReconstructionThreshold =
        getSuggestedThreshold(participantCount);
    const reconstructionThreshold =
        poll.requestedReconstructionThreshold ??
        (participantCount >= minimumSupportedParticipantCount
            ? suggestedReconstructionThreshold
            : null);
    const minimumPublishedVoterCount =
        poll.requestedMinimumPublishedVoterCount ??
        (participantCount >= minimumSupportedParticipantCount &&
        reconstructionThreshold !== null
            ? defaultMinimumPublishedVoterCount(
                  reconstructionThreshold,
                  participantCount,
              )
            : null);

    return {
        reconstructionThreshold,
        minimumPublishedVoterCount,
        suggestedReconstructionThreshold,
        maxParticipants: 51,
        validationTarget: 15,
    };
};

const isSignedPayloadOfType = <
    TPayload extends SignedPayload['payload']['messageType'],
>(
    signedPayload: SignedPayload,
    messageType: TPayload,
): signedPayload is SignedPayload<
    Extract<SignedPayload['payload'], { messageType: TPayload }>
> => signedPayload.payload.messageType === messageType;

const findManifestPublication = (
    acceptedPayloads: readonly SignedPayload[],
): SignedPayload<ManifestPublicationPayload> | null => {
    const manifestPayloads = acceptedPayloads.filter((signedPayload) =>
        isSignedPayloadOfType(signedPayload, 'manifest-publication'),
    );

    if (manifestPayloads.length !== 1) {
        return null;
    }

    return manifestPayloads[0];
};

const findPhaseDigest = (
    phaseDigests: PollResponse['boardAudit']['phaseDigests'],
    phase: number,
): string | null =>
    phaseDigests.find((phaseDigest) => phaseDigest.phase === phase)?.digest ??
    null;

const derivePollPhase = ({
    acceptedPayloads,
    dkgAborted,
    isOpen,
    verificationStatus,
}: {
    acceptedPayloads: readonly SignedPayload[];
    dkgAborted: boolean;
    isOpen: boolean;
    verificationStatus: PollResponse['verification']['status'];
}): PollResponse['phase'] => {
    if (isOpen) {
        return 'registration';
    }

    if (
        dkgAborted ||
        acceptedPayloads.some((payload) =>
            isSignedPayloadOfType(payload, 'ceremony-restart'),
        )
    ) {
        return 'aborted';
    }

    if (verificationStatus === 'verified') {
        return 'complete';
    }

    if (
        acceptedPayloads.some(
            (payload) =>
                isSignedPayloadOfType(payload, 'decryption-share') ||
                isSignedPayloadOfType(payload, 'tally-publication'),
        )
    ) {
        return 'decryption';
    }

    if (
        acceptedPayloads.some((payload) =>
            isSignedPayloadOfType(payload, 'ballot-submission'),
        )
    ) {
        return 'ballot';
    }

    return 'setup';
};

const buildNotReadyVerification = (
    qualParticipantIndices: readonly number[],
    reason: string,
): PollResponse['verification'] => ({
    status: 'not-ready',
    reason,
    qualParticipantIndices: [...qualParticipantIndices],
    verifiedOptionTallies: [],
});

const buildInvalidVerification = (
    qualParticipantIndices: readonly number[],
    reason: string,
): PollResponse['verification'] => ({
    status: 'invalid',
    reason,
    qualParticipantIndices: [...qualParticipantIndices],
    verifiedOptionTallies: [],
});

const buildVerifiedVerification = ({
    acceptedCounts,
    tallies,
    qualParticipantIndices,
}: {
    acceptedCounts: ReadonlyMap<number, number>;
    tallies: readonly {
        optionIndex: number;
        tally: bigint;
    }[];
    qualParticipantIndices: readonly number[];
}): PollResponse['verification'] => ({
    status: 'verified',
    reason: null,
    qualParticipantIndices: [...qualParticipantIndices],
    verifiedOptionTallies: tallies.map(({ optionIndex, tally }) => {
        const acceptedBallotCount = acceptedCounts.get(optionIndex) ?? 0;

        return {
            optionIndex,
            tally: tally.toString(),
            mean:
                acceptedBallotCount > 0
                    ? Number((Number(tally) / acceptedBallotCount).toFixed(6))
                    : 0,
            acceptedBallotCount,
        };
    }),
});

const buildVerificationSummary = async ({
    acceptedPayloads,
    manifest,
    manifestHash,
    requestedThresholdError,
    sessionId,
}: {
    acceptedPayloads: readonly SignedPayload[];
    manifest: ElectionManifest | null;
    manifestHash: string | null;
    requestedThresholdError: string | null;
    sessionId: string | null;
}): Promise<{
    dkgAborted: boolean;
    qualParticipantIndices: readonly number[];
    verification: PollResponse['verification'];
}> => {
    if (requestedThresholdError) {
        return {
            dkgAborted: false,
            qualParticipantIndices: [],
            verification: buildInvalidVerification([], requestedThresholdError),
        };
    }

    if (!manifest || !manifestHash || !sessionId) {
        return {
            dkgAborted: false,
            qualParticipantIndices: [],
            verification: buildNotReadyVerification(
                [],
                'Manifest publication has not been accepted yet.',
            ),
        };
    }

    const dkgTranscript = acceptedPayloads.filter(
        (payload) =>
            !isSignedPayloadOfType(payload, 'ballot-submission') &&
            !isSignedPayloadOfType(payload, 'decryption-share') &&
            !isSignedPayloadOfType(payload, 'tally-publication'),
    );

    let qualParticipantIndices: readonly number[] = [];
    let dkgAborted = false;

    try {
        const dkgState = replayGjkrTranscript(
            {
                protocol: 'gjkr',
                sessionId,
                manifestHash,
                group: manifest.suiteId,
                participantCount: manifest.participantCount,
                threshold: manifest.reconstructionThreshold,
            },
            dkgTranscript,
        );

        qualParticipantIndices = dkgState.qual;

        if (dkgState.phase === 'aborted') {
            dkgAborted = true;
            return {
                dkgAborted,
                qualParticipantIndices,
                verification: buildInvalidVerification(
                    qualParticipantIndices,
                    dkgState.abortReason ?? 'The DKG ceremony aborted.',
                ),
            };
        }

        if (dkgState.phase !== 'completed') {
            return {
                dkgAborted,
                qualParticipantIndices,
                verification: buildNotReadyVerification(
                    qualParticipantIndices,
                    'The DKG transcript is still incomplete.',
                ),
            };
        }

        const verifiedDKG = await verifyDKGTranscript({
            protocol: 'gjkr',
            transcript: dkgTranscript,
            manifest,
            sessionId,
        });
        qualParticipantIndices = verifiedDKG.qual;
    } catch (error) {
        return {
            dkgAborted,
            qualParticipantIndices,
            verification: buildInvalidVerification(
                qualParticipantIndices,
                error instanceof Error
                    ? error.message
                    : 'The DKG transcript could not be verified.',
            ),
        };
    }

    const ballotPayloads = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'ballot-submission'),
    ) as readonly SignedPayload<BallotSubmissionPayload>[];
    const decryptionSharePayloads = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'decryption-share'),
    ) as readonly SignedPayload<DecryptionSharePayload>[];
    const tallyPublications = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'tally-publication'),
    ) as readonly SignedPayload<TallyPublicationPayload>[];

    if (ballotPayloads.length === 0) {
        return {
            dkgAborted,
            qualParticipantIndices,
            verification: buildNotReadyVerification(
                qualParticipantIndices,
                'No accepted ballot submissions have been published yet.',
            ),
        };
    }

    if (decryptionSharePayloads.length === 0) {
        return {
            dkgAborted,
            qualParticipantIndices,
            verification: buildNotReadyVerification(
                qualParticipantIndices,
                'No accepted decryption shares have been published yet.',
            ),
        };
    }

    const verificationResult = await verifyElectionCeremonyDetailedResult({
        protocol: 'gjkr',
        manifest,
        sessionId,
        dkgTranscript,
        ballotPayloads,
        decryptionSharePayloads,
        tallyPublications,
    });

    if (!verificationResult.ok) {
        return {
            dkgAborted,
            qualParticipantIndices,
            verification: buildInvalidVerification(
                qualParticipantIndices,
                verificationResult.error.reason,
            ),
        };
    }

    const acceptedCounts = new Map(
        verificationResult.verified.perOptionAcceptedCounts.map(
            ({ acceptedCount, optionIndex }) => [optionIndex, acceptedCount],
        ),
    );

    return {
        dkgAborted,
        qualParticipantIndices,
        verification: buildVerifiedVerification({
            acceptedCounts,
            tallies: verificationResult.verified.perOptionTallies,
            qualParticipantIndices: verificationResult.verified.qual,
        }),
    };
};

const getPollRow = async (
    db: ReadOnlyDatabase,
    pollRef: string,
): Promise<
    | (PollRow & {
          choices: {
              choiceName: string;
          }[];
          voters: {
              voterIndex: number;
              voterName: string;
          }[];
      })
    | undefined
> =>
    await db.query.polls.findFirst({
        where: (fields, { eq: isEqual }) =>
            isUuid(pollRef)
                ? isEqual(fields.id, pollRef)
                : isEqual(fields.slug, pollRef),
        columns: {
            createdAt: true,
            id: true,
            isOpen: true,
            pollName: true,
            protocolVersion: true,
            requestedMinimumPublishedVoterCount: true,
            requestedReconstructionThreshold: true,
            slug: true,
        },
        with: {
            choices: {
                columns: {
                    choiceName: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.choiceIndex),
            },
            voters: {
                columns: {
                    voterIndex: true,
                    voterName: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.voterIndex),
            },
        },
    });

export const getPollFetchReadModel = async (
    db: ReadOnlyDatabase,
    pollRef: string,
): Promise<PollResponse | undefined> => {
    const poll = await getPollRow(db, pollRef);

    if (!poll) {
        return undefined;
    }

    const rows = await getBoardMessageRows(db, poll.id);
    const classifiedBoard = await classifyBoardMessages(rows);
    const manifestPublication = findManifestPublication(
        classifiedBoard.acceptedPayloads,
    );
    const manifest = manifestPublication?.payload.manifest ?? null;
    const manifestHash = manifestPublication?.payload.manifestHash ?? null;
    const sessionId = manifestPublication?.payload.sessionId ?? null;
    const participantCount = poll.voters.length;
    const thresholds = resolveThresholdSummary(poll, participantCount);
    const requestedThresholdError = poll.isOpen
        ? null
        : getRequestedThresholdError(
              thresholds.reconstructionThreshold,
              poll.requestedMinimumPublishedVoterCount,
              participantCount,
          );
    const setupDigest = findPhaseDigest(
        classifiedBoard.boardAudit.phaseDigests,
        0,
    );
    const sessionFingerprint = setupDigest
        ? formatSessionFingerprint(setupDigest)
        : null;

    let manifestHashMatchesPayload = true;
    if (manifest && manifestHash) {
        manifestHashMatchesPayload =
            (await hashElectionManifest(manifest)) === manifestHash;
    }

    const verificationSummary = manifestHashMatchesPayload
        ? await buildVerificationSummary({
              acceptedPayloads: classifiedBoard.acceptedPayloads,
              manifest,
              manifestHash,
              requestedThresholdError,
              sessionId,
          })
        : {
              dkgAborted: false,
              qualParticipantIndices: [],
              verification: buildInvalidVerification(
                  [],
                  'Manifest hash does not match the published manifest body.',
              ),
          };

    return {
        id: poll.id,
        slug: poll.slug,
        pollName: poll.pollName,
        createdAt: normalizeDatabaseTimestamp(poll.createdAt),
        isOpen: poll.isOpen,
        choices: poll.choices.map(({ choiceName }) => choiceName),
        voters: poll.voters.map(({ voterIndex, voterName }) => ({
            voterIndex,
            voterName,
        })),
        manifest,
        manifestHash,
        sessionId,
        sessionFingerprint,
        phase: derivePollPhase({
            acceptedPayloads: classifiedBoard.acceptedPayloads,
            dkgAborted: verificationSummary.dkgAborted,
            isOpen: poll.isOpen,
            verificationStatus: verificationSummary.verification.status,
        }),
        boardAudit: classifiedBoard.boardAudit,
        verification: verificationSummary.verification,
        boardEntries: classifiedBoard.records,
        thresholds,
    };
};

export const getPollById = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<PollResponse | undefined> => {
    const [poll] = await db
        .select({
            id: polls.id,
        })
        .from(polls)
        .where(eq(polls.id, pollId));

    if (!poll) {
        return undefined;
    }

    return await getPollFetchReadModel(db, poll.id);
};

export const findAcceptedRegistrationPayload = async (
    db: ReadOnlyDatabase,
    pollId: string,
    participantIndex: number,
): Promise<SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'registration' }>
> | null> => {
    const rows = await getBoardMessageRows(db, pollId);
    const classifiedBoard = await classifyBoardMessages(rows);

    const payload = classifiedBoard.acceptedPayloads.find(
        (signedPayload) =>
            signedPayload.payload.participantIndex === participantIndex &&
            isSignedPayloadOfType(signedPayload, 'registration'),
    );

    return payload && isSignedPayloadOfType(payload, 'registration')
        ? payload
        : null;
};

export const getAcceptedManifestPublication = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<SignedPayload<ManifestPublicationPayload> | null> => {
    const rows = await getBoardMessageRows(db, pollId);
    const classifiedBoard = await classifyBoardMessages(rows);
    return findManifestPublication(classifiedBoard.acceptedPayloads);
};
