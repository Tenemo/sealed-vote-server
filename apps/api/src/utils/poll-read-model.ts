import {
    isUuid,
    orderVerifiedOptionTallies,
    type PollResponse,
} from '@sealed-vote/contracts';
import { sortProtocolPayloads } from '@sealed-vote/protocol';
import { eq } from 'drizzle-orm';
import {
    hashProtocolTranscript,
    majorityThreshold,
    type ElectionManifest,
    type ManifestPublicationPayload,
    type RegistrationPayload,
    type SignedPayload,
    tryVerifyElectionCeremony,
    verifyDKGTranscript,
} from 'threshold-elgamal';

import type { Database, DatabaseTransaction } from '../database/client.js';
import { polls } from '../database/schema.js';

import {
    classifyBoardMessages,
    getBoardMessageRows,
} from './board-messages.js';
import { normalizeDatabaseTimestamp } from './database.js';
import { parseVoterDeviceRecord } from './voter-device-records.js';
import { derivePollCeremonySession } from './poll-ceremony-sessions.js';
import {
    maximumPollVoterCount,
    minimumPollVotersToClose,
} from './poll-limits.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;
type PollRow = Pick<
    typeof polls.$inferSelect,
    'createdAt' | 'id' | 'isOpen' | 'pollName' | 'protocolVersion' | 'slug'
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

type TypedSignedPayload<
    TPayload extends SignedPayload['payload']['messageType'],
> = SignedPayload<Extract<SignedPayload['payload'], { messageType: TPayload }>>;

const getAcceptedPayloadsOfType = <
    TPayload extends SignedPayload['payload']['messageType'],
>(
    acceptedPayloads: readonly SignedPayload[],
    messageType: TPayload,
): readonly TypedSignedPayload<TPayload>[] =>
    acceptedPayloads.filter((payload) =>
        isSignedPayloadOfType(payload, messageType),
    ) as unknown as readonly TypedSignedPayload<TPayload>[];

const getRecordPayloadsOfType = <
    TPayload extends SignedPayload['payload']['messageType'],
>(
    records: PollResponse['boardEntries'],
    messageType: TPayload,
): readonly TypedSignedPayload<TPayload>[] => {
    return records
        .filter((record) => record.messageType === messageType)
        .map(
            (record) => record.signedPayload,
        ) as unknown as readonly TypedSignedPayload<TPayload>[];
};

type BallotCloseSlotState = {
    acceptedPayload: TypedSignedPayload<'ballot-close'> | null;
    acceptedPayloads: readonly TypedSignedPayload<'ballot-close'>[];
    invalidReason: string | null;
    occupied: boolean;
    rawPayloads: readonly TypedSignedPayload<'ballot-close'>[];
};

export const deriveBallotCloseSlotState = ({
    acceptedPayloads,
    currentSessionRecords,
}: {
    acceptedPayloads: readonly SignedPayload[];
    currentSessionRecords: PollResponse['boardEntries'];
}): BallotCloseSlotState => {
    const rawPayloads = getRecordPayloadsOfType(
        currentSessionRecords,
        'ballot-close',
    );
    const acceptedBallotClosePayloads = getAcceptedPayloadsOfType(
        acceptedPayloads,
        'ballot-close',
    );
    const hasEquivocation = currentSessionRecords.some(
        (record) =>
            record.messageType === 'ballot-close' &&
            record.classification === 'equivocation',
    );

    if (rawPayloads.length === 0) {
        return {
            acceptedPayload: null,
            acceptedPayloads: acceptedBallotClosePayloads,
            invalidReason: null,
            occupied: false,
            rawPayloads,
        };
    }

    if (hasEquivocation) {
        return {
            acceptedPayload: null,
            acceptedPayloads: acceptedBallotClosePayloads,
            invalidReason:
                'Detected ballot-close equivocation for the current session.',
            occupied: true,
            rawPayloads,
        };
    }

    if (acceptedBallotClosePayloads.length !== 1) {
        return {
            acceptedPayload: null,
            acceptedPayloads: acceptedBallotClosePayloads,
            invalidReason:
                'Ballot close requires exactly one accepted payload in the current session.',
            occupied: true,
            rawPayloads,
        };
    }

    return {
        acceptedPayload: acceptedBallotClosePayloads[0],
        acceptedPayloads: acceptedBallotClosePayloads,
        invalidReason: null,
        occupied: true,
        rawPayloads,
    };
};

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

const findBlockingVoterIndices = ({
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
    ceremonyParticipantCount,
}: {
    isOpen: boolean;
    ceremonyParticipantCount: number;
}): PollResponse['thresholds'] => {
    const reconstructionThreshold =
        !isOpen && ceremonyParticipantCount >= minimumPollVotersToClose
            ? majorityThreshold(ceremonyParticipantCount)
            : null;

    return {
        reconstructionThreshold,
        minimumPublishedVoterCount: reconstructionThreshold,
        maximumVoterCount: maximumPollVoterCount,
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
    verifiedOptionTallies: orderVerifiedOptionTallies(
        tallies.map(({ optionIndex, tally }) => {
            const acceptedBallotCount = acceptedCounts.get(optionIndex) ?? 0;

            return {
                optionIndex,
                tally: tally.toString(),
                mean:
                    acceptedBallotCount > 0
                        ? Number(
                              (Number(tally) / acceptedBallotCount).toFixed(6),
                          )
                        : 0,
                acceptedBallotCount,
            };
        }),
    ),
});

const buildVerificationSummary = async ({
    acceptedPayloads,
    currentSessionRecords,
    manifest,
    sessionId,
    participantCount,
}: {
    acceptedPayloads: readonly SignedPayload[];
    currentSessionRecords: PollResponse['boardEntries'];
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
                'Voting is still open. The ceremony transcript will begin after the creator closes the vote.',
            ),
        };
    }

    const acceptedDkgTranscript = acceptedPayloads.filter(
        (payload) =>
            !isSignedPayloadOfType(payload, 'ballot-submission') &&
            !isSignedPayloadOfType(payload, 'ballot-close') &&
            !isSignedPayloadOfType(payload, 'decryption-share') &&
            !isSignedPayloadOfType(payload, 'tally-publication'),
    );

    if (
        !acceptedDkgTranscript.some((payload) =>
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
            transcript: acceptedDkgTranscript,
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

    const ballotCloseSlotState = deriveBallotCloseSlotState({
        acceptedPayloads,
        currentSessionRecords,
    });

    if (!ballotCloseSlotState.occupied) {
        const completeEncryptedBallotParticipantCount =
            countCompleteBallotParticipants({
                acceptedPayloads,
                optionCount: manifest.optionList.length,
            });

        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildNotReadyVerification(
                verifiedDkg.qualifiedParticipantIndices,
                completeEncryptedBallotParticipantCount === participantCount
                    ? 'All encrypted ballots are accepted. Waiting for the automatic reveal to start.'
                    : 'Encrypted ballots are still accumulating.',
            ),
        };
    }

    if (ballotCloseSlotState.invalidReason) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildInvalidVerification(
                verifiedDkg.qualifiedParticipantIndices,
                ballotCloseSlotState.invalidReason,
            ),
        };
    }

    const decryptionSharePayloads = getAcceptedPayloadsOfType(
        acceptedPayloads,
        'decryption-share',
    );

    if (decryptionSharePayloads.length === 0) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildNotReadyVerification(
                verifiedDkg.qualifiedParticipantIndices,
                'Reveal has started. Waiting for threshold decryption shares.',
            ),
        };
    }

    const tallyPublications = getAcceptedPayloadsOfType(
        acceptedPayloads,
        'tally-publication',
    );

    if (tallyPublications.length === 0) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildNotReadyVerification(
                verifiedDkg.qualifiedParticipantIndices,
                'Decryption shares are arriving. Waiting for final tally publication.',
            ),
        };
    }

    if (tallyPublications.length < manifest.optionList.length) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildNotReadyVerification(
                verifiedDkg.qualifiedParticipantIndices,
                'Final tally publication is still in progress.',
            ),
        };
    }

    const currentSessionPayloads = currentSessionRecords.map(
        (record) => record.signedPayload,
    );
    const rawDkgTranscript = currentSessionPayloads.filter(
        (payload) =>
            !isSignedPayloadOfType(payload, 'ballot-submission') &&
            !isSignedPayloadOfType(payload, 'ballot-close') &&
            !isSignedPayloadOfType(payload, 'decryption-share') &&
            !isSignedPayloadOfType(payload, 'tally-publication'),
    );

    const verificationResult = await tryVerifyElectionCeremony({
        manifest,
        sessionId,
        dkgTranscript: rawDkgTranscript,
        ballotPayloads: getRecordPayloadsOfType(
            currentSessionRecords,
            'ballot-submission',
        ),
        ballotClosePayloads: ballotCloseSlotState.rawPayloads,
        decryptionSharePayloads: getRecordPayloadsOfType(
            currentSessionRecords,
            'decryption-share',
        ),
        tallyPublications: getRecordPayloadsOfType(
            currentSessionRecords,
            'tally-publication',
        ),
    });

    if (!verificationResult.ok) {
        return {
            dkgCompleted: true,
            qualParticipantIndices: verifiedDkg.qualifiedParticipantIndices,
            verification: buildInvalidVerification(
                verifiedDkg.qualifiedParticipantIndices,
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
        qualParticipantIndices:
            verificationResult.verified.qualifiedParticipantIndices,
        verification: buildVerifiedVerification({
            acceptedCounts,
            tallies: verificationResult.verified.perOptionTallies,
            qualParticipantIndices:
                verificationResult.verified.qualifiedParticipantIndices,
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
    database: ReadOnlyDatabase,
    pollReference: string,
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
    await database.query.polls.findFirst({
        where: (fields, { eq: isEqual }) =>
            isUuid(pollReference)
                ? isEqual(fields.id, pollReference)
                : isEqual(fields.slug, pollReference),
        columns: {
            createdAt: true,
            id: true,
            isOpen: true,
            pollName: true,
            protocolVersion: true,
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
    database: ReadOnlyDatabase,
    pollReference: string,
): Promise<PollResponse | undefined> => {
    const poll = await getPollRow(database, pollReference);

    if (!poll) {
        return undefined;
    }

    const rows = await getBoardMessageRows(database, poll.id);
    const classifiedBoard = await classifyBoardMessages(rows);
    const submittedVoterCount = poll.voters.length;
    const ceremonySession = await derivePollCeremonySession({
        choices: poll.choices.map(({ choiceName }) => choiceName),
        isOpen: poll.isOpen,
        participants: poll.voters,
        persistedSessions: poll.pollCeremonySessions,
        pollCreatedAt: poll.createdAt,
        pollId: poll.id,
        protocolVersion: poll.protocolVersion,
    });
    const activeParticipantCount = ceremonySession.activeParticipantCount;
    const voterDeviceReadinessByIndex = new Map(
        poll.voters.map((voter) => [
            voter.voterIndex,
            parseVoterDeviceRecord(voter.publicKeyShares[0]?.publicKeyShare) !==
                null,
        ]),
    );
    const thresholds = buildThresholdSummary({
        isOpen: poll.isOpen,
        ceremonyParticipantCount: activeParticipantCount,
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
    const ballotCloseSlotState = deriveBallotCloseSlotState({
        acceptedPayloads,
        currentSessionRecords,
    });
    const hasBallotClose = ballotCloseSlotState.occupied;
    const revealReady =
        !poll.isOpen &&
        reconstructionThreshold !== null &&
        completeEncryptedBallotParticipantCount === activeParticipantCount &&
        !hasBallotClose;
    const blockingVoterIndices =
        !poll.isOpen && !hasBallotClose
            ? findBlockingVoterIndices({
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
        currentSessionRecords,
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
                : blockingVoterIndices.includes(voterIndex)
                  ? 'blocking'
                  : 'active',
            deviceReady: voterDeviceReadinessByIndex.get(voterIndex) ?? false,
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
        submittedVoterCount,
        minimumCloseVoterCount: minimumPollVotersToClose,
        ceremony: {
            acceptedDecryptionShareCount,
            acceptedEncryptedBallotCount,
            acceptedRegistrationCount,
            activeParticipantCount,
            blockingVoterIndices,
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
    database: ReadOnlyDatabase,
    pollId: string,
): Promise<PollResponse | undefined> => {
    const [poll] = await database
        .select({
            id: polls.id,
        })
        .from(polls)
        .where(eq(polls.id, pollId));

    if (!poll) {
        return undefined;
    }

    return await getPollFetchReadModel(database, poll.id);
};

export const findAcceptedRegistrationPayload = async (
    database: ReadOnlyDatabase,
    pollId: string,
    participantIndex: number,
): Promise<SignedPayload<RegistrationPayload> | null> => {
    const rows = await getBoardMessageRows(database, pollId);
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
    database: ReadOnlyDatabase,
    pollId: string,
): Promise<SignedPayload<ManifestPublicationPayload> | null> => {
    const rows = await getBoardMessageRows(database, pollId);
    const classifiedBoard = await classifyBoardMessages(rows);
    const payload = classifiedBoard.acceptedPayloads.find((signedPayload) =>
        isSignedPayloadOfType(signedPayload, 'manifest-publication'),
    );

    return payload && isSignedPayloadOfType(payload, 'manifest-publication')
        ? payload
        : null;
};
