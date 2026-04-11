import { isUuid, type PollResponse } from '@sealed-vote/contracts';
import { eq } from 'drizzle-orm';
import {
    createElectionManifest,
    deriveSessionId,
    hashElectionManifest,
    hashRosterEntries,
    majorityThreshold,
    type BallotClosePayload,
    type BallotSubmissionPayload,
    type DecryptionSharePayload,
    type EncodedAuthPublicKey,
    type EncodedTransportPublicKey,
    type ElectionManifest,
    type ManifestPublicationPayload,
    type RegistrationPayload,
    type SignedPayload,
    type TallyPublicationPayload,
    verifyDKGTranscript,
    verifyElectionCeremonyDetailedResult,
} from 'threshold-elgamal';

import type { Database, DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

import { classifyBoardMessages, getBoardMessageRows } from './boardMessages.js';
import { normalizeDatabaseTimestamp } from './db.js';
import { parseParticipantDeviceRecord } from './participantDevices.js';
import {
    maxPollParticipants,
    minimumPollParticipantsToClose,
} from './pollLimits.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;
type PollRow = Pick<
    typeof polls.$inferSelect,
    'createdAt' | 'id' | 'isOpen' | 'pollName' | 'slug'
>;

const validationTarget = 15;

const formatSessionFingerprint = (value: string): string =>
    value
        .slice(0, 32)
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join('-') ?? value.slice(0, 32).toUpperCase();

const isSignedPayloadOfType = <
    TPayload extends SignedPayload['payload']['messageType'],
>(
    signedPayload: SignedPayload,
    messageType: TPayload,
): signedPayload is SignedPayload<
    Extract<SignedPayload['payload'], { messageType: TPayload }>
> => signedPayload.payload.messageType === messageType;

const countAcceptedMessages = (
    acceptedPayloads: readonly SignedPayload[],
    messageType: SignedPayload['payload']['messageType'],
): number =>
    acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, messageType),
    ).length;

const countCompleteBallotParticipants = ({
    acceptedPayloads,
    optionCount,
}: {
    acceptedPayloads: readonly SignedPayload[];
    optionCount: number;
}): number => {
    const ballotsByParticipant = new Map<number, Set<number>>();

    for (const payload of acceptedPayloads) {
        if (!isSignedPayloadOfType(payload, 'ballot-submission')) {
            continue;
        }

        const optionIndices =
            ballotsByParticipant.get(payload.payload.participantIndex) ??
            new Set<number>();
        optionIndices.add(payload.payload.optionIndex);
        ballotsByParticipant.set(
            payload.payload.participantIndex,
            optionIndices,
        );
    }

    return [...ballotsByParticipant.values()].filter(
        (optionIndices) => optionIndices.size === optionCount,
    ).length;
};

const buildThresholdSummary = ({
    isOpen,
    participantCount,
}: {
    isOpen: boolean;
    participantCount: number;
}): PollResponse['thresholds'] => {
    const reconstructionThreshold =
        !isOpen && participantCount >= minimumPollParticipantsToClose
            ? majorityThreshold(participantCount)
            : null;

    return {
        reconstructionThreshold,
        minimumPublishedVoterCount: reconstructionThreshold,
        maxParticipants: maxPollParticipants,
        validationTarget,
    };
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
    sessionId,
    submittedParticipantCount,
}: {
    acceptedPayloads: readonly SignedPayload[];
    manifest: ElectionManifest | null;
    sessionId: string | null;
    submittedParticipantCount: number;
}): Promise<{
    dkgCompleted: boolean;
    qualParticipantIndices: readonly number[];
    verification: PollResponse['verification'];
}> => {
    if (!manifest || !sessionId) {
        return {
            dkgCompleted: false,
            qualParticipantIndices: [],
            verification: buildNotReadyVerification(
                [],
                'Voting is still open. The ceremony transcript will begin after the organizer closes the vote.',
            ),
        };
    }

    const dkgTranscript = acceptedPayloads.filter(
        (payload) =>
            !isSignedPayloadOfType(payload, 'ballot-submission') &&
            !isSignedPayloadOfType(payload, 'ballot-close') &&
            !isSignedPayloadOfType(payload, 'decryption-share') &&
            !isSignedPayloadOfType(payload, 'tally-publication'),
    );

    if (
        !dkgTranscript.some((payload) =>
            isSignedPayloadOfType(payload, 'manifest-publication'),
        )
    ) {
        return {
            dkgCompleted: false,
            qualParticipantIndices: [],
            verification: buildNotReadyVerification(
                [],
                'The frozen manifest has not been published yet.',
            ),
        };
    }

    const acceptedRegistrations = countAcceptedMessages(
        acceptedPayloads,
        'registration',
    );
    if (acceptedRegistrations === 0) {
        return {
            dkgCompleted: false,
            qualParticipantIndices: [],
            verification: buildNotReadyVerification(
                [],
                'Participant registrations are still being published to the board.',
            ),
        };
    }

    const keyConfirmations = countAcceptedMessages(
        acceptedPayloads,
        'key-derivation-confirmation',
    );

    if (keyConfirmations < acceptedRegistrations) {
        return {
            dkgCompleted: false,
            qualParticipantIndices: [],
            verification: buildNotReadyVerification(
                [],
                'The distributed key generation transcript is still incomplete.',
            ),
        };
    }

    let verifiedDkg: Awaited<ReturnType<typeof verifyDKGTranscript>>;
    try {
        verifiedDkg = await verifyDKGTranscript({
            transcript: dkgTranscript,
            manifest,
            sessionId,
        });
    } catch (error) {
        return {
            dkgCompleted: false,
            qualParticipantIndices: [],
            verification: buildInvalidVerification(
                [],
                error instanceof Error
                    ? error.message
                    : 'The DKG transcript could not be verified.',
            ),
        };
    }

    const ballotClosePayload = acceptedPayloads.find((payload) =>
        isSignedPayloadOfType(payload, 'ballot-close'),
    ) as SignedPayload<BallotClosePayload> | undefined;

    if (!ballotClosePayload) {
        const completeEncryptedBallotParticipantCount =
            countCompleteBallotParticipants({
                acceptedPayloads,
                optionCount: manifest.optionList.length,
            });

        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qual,
            verification: buildNotReadyVerification(
                verifiedDkg.qual,
                completeEncryptedBallotParticipantCount ===
                    submittedParticipantCount
                    ? 'All encrypted ballots are accepted. Waiting for the automatic reveal to start.'
                    : 'Encrypted ballots are still accumulating.',
            ),
        };
    }

    const decryptionSharePayloads = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'decryption-share'),
    ) as readonly SignedPayload<DecryptionSharePayload>[];

    if (decryptionSharePayloads.length === 0) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qual,
            verification: buildNotReadyVerification(
                verifiedDkg.qual,
                'Reveal has started. Waiting for threshold decryption shares.',
            ),
        };
    }

    const tallyPublications = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'tally-publication'),
    ) as readonly SignedPayload<TallyPublicationPayload>[];

    if (tallyPublications.length === 0) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qual,
            verification: buildNotReadyVerification(
                verifiedDkg.qual,
                'Decryption shares are arriving. Waiting for final tally publication.',
            ),
        };
    }

    if (tallyPublications.length < manifest.optionList.length) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qual,
            verification: buildNotReadyVerification(
                verifiedDkg.qual,
                'Final tally publication is still in progress.',
            ),
        };
    }

    const ballotPayloads = acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, 'ballot-submission'),
    ) as readonly SignedPayload<BallotSubmissionPayload>[];

    const verificationResult = await verifyElectionCeremonyDetailedResult({
        manifest,
        sessionId,
        dkgTranscript,
        ballotPayloads,
        ballotClosePayload,
        decryptionSharePayloads,
        tallyPublications,
    });

    if (!verificationResult.ok) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qual,
            verification: buildInvalidVerification(
                verifiedDkg.qual,
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
        dkgCompleted: true,
        qualParticipantIndices: verificationResult.verified.qual,
        verification: buildVerifiedVerification({
            acceptedCounts,
            tallies: verificationResult.verified.perOptionTallies,
            qualParticipantIndices: verificationResult.verified.qual,
        }),
    };
};

const derivePollPhase = ({
    isOpen,
    verification,
    revealReady,
    hasBallotClose,
}: {
    hasBallotClose: boolean;
    isOpen: boolean;
    revealReady: boolean;
    verification: PollResponse['verification'];
}): PollResponse['phase'] => {
    if (isOpen) {
        return 'open';
    }

    if (verification.status === 'invalid') {
        return 'aborted';
    }

    if (verification.status === 'verified') {
        return 'complete';
    }

    if (hasBallotClose) {
        return 'revealing';
    }

    if (revealReady) {
        return 'ready-to-reveal';
    }

    return 'securing';
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
              id: string;
              publicKeyShares: {
                  publicKeyShare: string;
              }[];
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
                    id: true,
                    voterIndex: true,
                    voterName: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.voterIndex),
                with: {
                    publicKeyShares: {
                        columns: {
                            publicKeyShare: true,
                        },
                    },
                },
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
    const participantCount = poll.voters.length;
    const thresholds = buildThresholdSummary({
        isOpen: poll.isOpen,
        participantCount,
    });
    const rosterEntries = poll.voters
        .map((participant) => {
            const deviceRecord = parseParticipantDeviceRecord(
                participant.publicKeyShares[0]?.publicKeyShare,
            );

            if (!deviceRecord) {
                return null;
            }

            return {
                authPublicKey: deviceRecord.authPublicKey,
                participantIndex: participant.voterIndex,
                transportPublicKey: deviceRecord.transportPublicKey,
                transportSuite: deviceRecord.transportSuite,
                voterName: participant.voterName,
            } satisfies PollResponse['rosterEntries'][number];
        })
        .filter(
            (entry): entry is PollResponse['rosterEntries'][number] =>
                entry !== null,
        );

    const rosterHash =
        !poll.isOpen && rosterEntries.length === participantCount
            ? await hashRosterEntries(
                  rosterEntries.map((entry) => ({
                      authPublicKey:
                          entry.authPublicKey as EncodedAuthPublicKey,
                      participantIndex: entry.participantIndex,
                      transportPublicKey:
                          entry.transportPublicKey as EncodedTransportPublicKey,
                  })),
              )
            : null;

    const manifest =
        rosterHash && !poll.isOpen
            ? createElectionManifest({
                  rosterHash,
                  optionList: poll.choices.map(({ choiceName }) => choiceName),
              })
            : null;
    const manifestHash = manifest ? await hashElectionManifest(manifest) : null;
    const sessionId =
        manifest && manifestHash && rosterHash
            ? await deriveSessionId(
                  manifestHash,
                  rosterHash,
                  poll.id,
                  normalizeDatabaseTimestamp(poll.createdAt),
              )
            : null;

    const acceptedPayloads = classifiedBoard.acceptedPayloads;
    const acceptedRegistrationCount = countAcceptedMessages(
        acceptedPayloads,
        'registration',
    );
    const acceptedEncryptedBallotCount = countAcceptedMessages(
        acceptedPayloads,
        'ballot-submission',
    );
    const acceptedDecryptionShareCount = countAcceptedMessages(
        acceptedPayloads,
        'decryption-share',
    );
    const completeEncryptedBallotParticipantCount =
        countCompleteBallotParticipants({
            acceptedPayloads,
            optionCount: poll.choices.length,
        });
    const reconstructionThreshold = thresholds.reconstructionThreshold;
    const hasBallotClose = acceptedPayloads.some((payload) =>
        isSignedPayloadOfType(payload, 'ballot-close'),
    );
    const revealReady =
        !poll.isOpen &&
        reconstructionThreshold !== null &&
        completeEncryptedBallotParticipantCount === participantCount &&
        !hasBallotClose;

    const verificationSummary = await buildVerificationSummary({
        acceptedPayloads,
        manifest,
        sessionId,
        submittedParticipantCount: participantCount,
    });
    const sessionFingerprint = classifiedBoard.boardAudit.ceremonyDigest
        ? formatSessionFingerprint(classifiedBoard.boardAudit.ceremonyDigest)
        : sessionId
          ? formatSessionFingerprint(sessionId)
          : null;

    return {
        id: poll.id,
        slug: poll.slug,
        pollName: poll.pollName,
        createdAt: normalizeDatabaseTimestamp(poll.createdAt),
        isOpen: poll.isOpen,
        choices: poll.choices.map(({ choiceName }) => choiceName),
        voters: poll.voters.map(
            ({ publicKeyShares, voterIndex, voterName }) => ({
                deviceReady: !!parseParticipantDeviceRecord(
                    publicKeyShares[0]?.publicKeyShare,
                ),
                voterIndex,
                voterName,
            }),
        ),
        manifest,
        manifestHash,
        sessionId,
        sessionFingerprint,
        phase: derivePollPhase({
            hasBallotClose,
            isOpen: poll.isOpen,
            revealReady,
            verification: verificationSummary.verification,
        }),
        submittedParticipantCount: participantCount,
        minimumCloseParticipantCount: minimumPollParticipantsToClose,
        ceremony: {
            acceptedDecryptionShareCount,
            acceptedEncryptedBallotCount,
            acceptedRegistrationCount,
            completeEncryptedBallotParticipantCount,
            revealReady,
        },
        boardAudit: classifiedBoard.boardAudit,
        verification: verificationSummary.verification,
        boardEntries: classifiedBoard.records,
        rosterEntries,
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
): Promise<SignedPayload<RegistrationPayload> | null> => {
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
    const payload = classifiedBoard.acceptedPayloads.find((signedPayload) =>
        isSignedPayloadOfType(signedPayload, 'manifest-publication'),
    );

    return payload && isSignedPayloadOfType(payload, 'manifest-publication')
        ? payload
        : null;
};
