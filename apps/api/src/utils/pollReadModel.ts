import { isUuid, type PollResponse } from '@sealed-vote/contracts';
import { sortProtocolPayloads } from '@sealed-vote/protocol';
import { eq } from 'drizzle-orm';
import {
    hashProtocolTranscript,
    majorityThreshold,
    type BallotClosePayload,
    type BallotSubmissionPayload,
    type DecryptionSharePayload,
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
import { derivePollCeremonySession } from './pollCeremonySessions.js';
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

const filterAcceptedPayloadsBySession = ({
    acceptedPayloads,
    sessionId,
}: {
    acceptedPayloads: readonly SignedPayload[];
    sessionId: string | null;
}): SignedPayload[] =>
    sessionId
        ? acceptedPayloads.filter(
              (payload) => payload.payload.sessionId === sessionId,
          )
        : [];

const filterBoardRecordsBySession = ({
    records,
    sessionId,
}: {
    records: PollResponse['boardEntries'];
    sessionId: string | null;
}): PollResponse['boardEntries'] =>
    sessionId
        ? records.filter(
              (record) => record.signedPayload.payload.sessionId === sessionId,
          )
        : [];

const findMissingParticipantsByMessageType = ({
    activeParticipants,
    acceptedPayloads,
    messageType,
}: {
    activeParticipants: readonly {
        assignedParticipantIndex: number;
        originalParticipantIndex: number;
    }[];
    acceptedPayloads: readonly SignedPayload[];
    messageType: SignedPayload['payload']['messageType'];
}): number[] => {
    const acceptedParticipants = new Set(
        acceptedPayloads
            .filter((payload) => isSignedPayloadOfType(payload, messageType))
            .map((payload) => payload.payload.participantIndex),
    );

    return activeParticipants
        .filter(
            (participant) =>
                !acceptedParticipants.has(participant.assignedParticipantIndex),
        )
        .map((participant) => participant.originalParticipantIndex);
};

const findMissingEncryptedShareDealers = ({
    activeParticipants,
    acceptedPayloads,
}: {
    activeParticipants: readonly {
        assignedParticipantIndex: number;
        originalParticipantIndex: number;
    }[];
    acceptedPayloads: readonly SignedPayload[];
}): number[] => {
    const expectedRecipientCount = activeParticipants.length - 1;
    const recipientsByDealer = new Map<number, Set<number>>();

    for (const payload of acceptedPayloads) {
        if (!isSignedPayloadOfType(payload, 'encrypted-dual-share')) {
            continue;
        }

        const recipients =
            recipientsByDealer.get(payload.payload.participantIndex) ??
            new Set<number>();
        recipients.add(payload.payload.recipientIndex);
        recipientsByDealer.set(payload.payload.participantIndex, recipients);
    }

    return activeParticipants
        .filter(
            (participant) =>
                (recipientsByDealer.get(participant.assignedParticipantIndex)
                    ?.size ?? 0) < expectedRecipientCount,
        )
        .map((participant) => participant.originalParticipantIndex);
};

const findBlockingParticipantIndices = ({
    acceptedPayloads,
    activeParticipants,
    optionCount,
}: {
    acceptedPayloads: readonly SignedPayload[];
    activeParticipants: readonly {
        assignedParticipantIndex: number;
        originalParticipantIndex: number;
    }[];
    optionCount: number;
}): number[] => {
    const missingRegistrations = findMissingParticipantsByMessageType({
        activeParticipants,
        acceptedPayloads,
        messageType: 'registration',
    });

    if (missingRegistrations.length > 0) {
        return missingRegistrations;
    }

    const manifestPublished = acceptedPayloads.some((payload) =>
        isSignedPayloadOfType(payload, 'manifest-publication'),
    );

    if (!manifestPublished) {
        return [];
    }

    const missingManifestAcceptances = findMissingParticipantsByMessageType({
        activeParticipants,
        acceptedPayloads,
        messageType: 'manifest-acceptance',
    });

    if (missingManifestAcceptances.length > 0) {
        return missingManifestAcceptances;
    }

    const missingPedersenCommitments = findMissingParticipantsByMessageType({
        activeParticipants,
        acceptedPayloads,
        messageType: 'pedersen-commitment',
    });

    if (missingPedersenCommitments.length > 0) {
        return missingPedersenCommitments;
    }

    const missingEncryptedShareDealers = findMissingEncryptedShareDealers({
        activeParticipants,
        acceptedPayloads,
    });

    if (missingEncryptedShareDealers.length > 0) {
        return missingEncryptedShareDealers;
    }

    const missingFeldmanCommitments = findMissingParticipantsByMessageType({
        activeParticipants,
        acceptedPayloads,
        messageType: 'feldman-commitment',
    });

    if (missingFeldmanCommitments.length > 0) {
        return missingFeldmanCommitments;
    }

    const missingKeyConfirmations = findMissingParticipantsByMessageType({
        activeParticipants,
        acceptedPayloads,
        messageType: 'key-derivation-confirmation',
    });

    if (missingKeyConfirmations.length > 0) {
        return missingKeyConfirmations;
    }

    const completeBallotParticipants = new Set(
        Array.from(
            acceptedPayloads
                .filter((payload) =>
                    isSignedPayloadOfType(payload, 'ballot-submission'),
                )
                .reduce((ballotsByParticipant, payload) => {
                    const optionIndices =
                        ballotsByParticipant.get(
                            payload.payload.participantIndex,
                        ) ?? new Set<number>();
                    optionIndices.add(payload.payload.optionIndex);
                    ballotsByParticipant.set(
                        payload.payload.participantIndex,
                        optionIndices,
                    );
                    return ballotsByParticipant;
                }, new Map<number, Set<number>>())
                .entries(),
        )
            .filter(([, optionIndices]) => optionIndices.size === optionCount)
            .map(([participantIndex]) => participantIndex),
    );

    return activeParticipants
        .filter(
            (participant) =>
                !completeBallotParticipants.has(
                    participant.assignedParticipantIndex,
                ),
        )
        .map((participant) => participant.originalParticipantIndex);
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
    participantCount,
}: {
    acceptedPayloads: readonly SignedPayload[];
    manifest: ElectionManifest | null;
    sessionId: string | null;
    participantCount: number;
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
                completeEncryptedBallotParticipantCount === participantCount
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
          pollCeremonySessions: {
              activeParticipantIndices: number[];
              createdAt: Date;
              id: string;
              sequence: number;
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
            pollCeremonySessions: {
                columns: {
                    activeParticipantIndices: true,
                    createdAt: true,
                    id: true,
                    sequence: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.sequence),
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
    const ceremonySession = await derivePollCeremonySession({
        choices: poll.choices.map(({ choiceName }) => choiceName),
        isOpen: poll.isOpen,
        participants: poll.voters,
        persistedSessions: poll.pollCeremonySessions,
        pollCreatedAt: poll.createdAt,
        pollId: poll.id,
    });
    const activeParticipantCount = ceremonySession.activeParticipantCount;
    const participantDeviceReadinessByIndex = new Map(
        poll.voters.map((participant) => [
            participant.voterIndex,
            parseParticipantDeviceRecord(
                participant.publicKeyShares[0]?.publicKeyShare,
            ) !== null,
        ]),
    );
    const thresholds = buildThresholdSummary({
        isOpen: poll.isOpen,
        participantCount: activeParticipantCount,
    });
    const manifest = ceremonySession.manifest;
    const manifestHash = ceremonySession.manifestHash;
    const sessionId = ceremonySession.sessionId;
    const rosterEntries = ceremonySession.rosterEntries;

    const acceptedPayloads = filterAcceptedPayloadsBySession({
        acceptedPayloads: classifiedBoard.acceptedPayloads,
        sessionId,
    });
    const currentSessionRecords = filterBoardRecordsBySession({
        records: classifiedBoard.records,
        sessionId,
    });
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
        completeEncryptedBallotParticipantCount === activeParticipantCount &&
        !hasBallotClose;
    const blockingParticipantIndices =
        !poll.isOpen && !hasBallotClose
            ? findBlockingParticipantIndices({
                  acceptedPayloads,
                  activeParticipants: ceremonySession.activeParticipants.map(
                      ({
                          assignedParticipantIndex,
                          originalParticipantIndex,
                      }) => ({
                          assignedParticipantIndex,
                          originalParticipantIndex,
                      }),
                  ),
                  optionCount: poll.choices.length,
              })
            : [];

    const verificationSummary = await buildVerificationSummary({
        acceptedPayloads,
        manifest,
        sessionId,
        participantCount: activeParticipantCount,
    });
    const hasCurrentSessionEquivocation = currentSessionRecords.some(
        (record) => record.classification === 'equivocation',
    );
    const currentSessionDigest =
        hasCurrentSessionEquivocation || acceptedPayloads.length === 0
            ? null
            : await hashProtocolTranscript(
                  sortProtocolPayloads(
                      acceptedPayloads.map((payload) => payload.payload),
                  ),
              );
    const sessionFingerprint = currentSessionDigest
        ? formatSessionFingerprint(currentSessionDigest)
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
        voters: poll.voters.map(({ voterIndex, voterName }) => ({
            ceremonyState: ceremonySession.skippedParticipantIndices.includes(
                voterIndex,
            )
                ? 'skipped'
                : blockingParticipantIndices.includes(voterIndex)
                  ? 'blocking'
                  : 'active',
            deviceReady:
                participantDeviceReadinessByIndex.get(voterIndex) ?? false,
            voterIndex,
            voterName,
        })),
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
            activeParticipantCount,
            blockingParticipantIndices,
            completeEncryptedBallotParticipantCount,
            revealReady,
            restartCount: ceremonySession.restartCount,
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
