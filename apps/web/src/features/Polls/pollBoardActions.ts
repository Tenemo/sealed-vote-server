import type { PollResponse } from '@sealed-vote/contracts';
import { sortProtocolPayloads } from '@sealed-vote/protocol';
import {
    combineDecryptionShares,
    createBallotClosePayload,
    createBallotSubmissionPayload,
    createDLEQProof,
    createDecryptionSharePayload,
    createDisjunctiveProof,
    createEncryptedDualSharePayload,
    createFeldmanCommitmentPayload,
    createKeyDerivationConfirmationPayload,
    createManifestAcceptancePayload,
    createManifestPublicationPayload,
    createPedersenCommitmentPayload,
    createRegistrationPayload,
    createSchnorrProof,
    createTallyPublicationPayload,
    createVerifiedDecryptionShare,
    decodePedersenShareEnvelope,
    decryptEnvelope,
    deriveJointPublicKey,
    derivePedersenShares,
    deriveTranscriptVerificationKey,
    encodePedersenShareEnvelope,
    encryptAdditiveWithRandomness,
    encryptEnvelope,
    generateFeldmanCommitments,
    generatePedersenCommitments,
    hashProtocolTranscript,
    majorityThreshold,
    modQ,
    RISTRETTO_GROUP,
    scoreVotingDomain,
    SHIPPED_PROTOCOL_VERSION,
    verifyBallotSubmissionPayloadsByOption,
    verifyDKGTranscript,
    verifyDLEQProof,
    verifyFeldmanShare,
    verifyPedersenShare,
    type DLEQStatement,
    type EncodedAuthPublicKey,
    type EncodedPoint,
    type EncodedTransportPublicKey,
    type FeldmanCommitments,
    type PedersenCommitments,
    type PedersenShare,
    type ProofContext,
    type SignedPayload,
} from 'threshold-elgamal';

import {
    importStoredAuthPrivateKey,
    prunePendingPayloadsForSession,
    restoreStoredTransportPrivateKey,
    savePendingPayloadIfAbsent,
    updatePollDeviceState,
    type StoredPollDeviceState,
} from './pollDeviceStorage';
import type {
    StoredCreatorSession,
    StoredVoterSession,
} from './pollSessionStorage';

const deriveFinalShare = ({
    contributions,
    participantIndex,
}: {
    contributions: readonly {
        dealerIndex: number;
        share: {
            blindingValue: bigint;
            index: number;
            secretValue: bigint;
        };
    }[];
    participantIndex: number;
}): { index: number; value: bigint } => ({
    index: participantIndex,
    value: contributions.reduce(
        (total, contribution) =>
            modQ(total + contribution.share.secretValue, RISTRETTO_GROUP.q),
        0n,
    ),
});

type AutomaticCeremonyActionKind =
    | 'publish-registration'
    | 'publish-manifest'
    | 'accept-manifest'
    | 'publish-pedersen-commitment'
    | 'publish-encrypted-share'
    | 'publish-feldman-commitment'
    | 'publish-key-confirmation'
    | 'publish-ballot'
    | 'publish-decryption-share'
    | 'publish-tally';

type PreparedCeremonyAction = {
    kind: AutomaticCeremonyActionKind | 'publish-ballot-close';
    signedPayload: SignedPayload;
    slotKey: string;
};

type ShouldAbortResolution = () => boolean;

type LocalDealerState = {
    blindingPolynomial: readonly bigint[];
    feldmanCommitments: FeldmanCommitments;
    pedersenCommitments: PedersenCommitments;
    secretPolynomial: readonly bigint[];
    shares: readonly PedersenShare[];
};

type AcceptedShareContribution = {
    dealerIndex: number;
    share: PedersenShare;
};

type LocalCeremonyParticipant = {
    assignedParticipantIndex: number;
    originalParticipantIndex: number;
};

const acceptedBoardPayloads = (poll: PollResponse): readonly SignedPayload[] =>
    poll.boardEntries
        .filter(
            (entry) =>
                entry.classification === 'accepted' &&
                entry.signedPayload.payload.sessionId === poll.sessionId,
        )
        .map((entry) => entry.signedPayload);

const findLocalCeremonyParticipant = ({
    deviceState,
    poll,
    voterSession,
}: {
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse;
    voterSession: StoredVoterSession | null;
}): LocalCeremonyParticipant | null => {
    if (!deviceState || !voterSession) {
        return null;
    }

    if (
        deviceState.pollId !== poll.id ||
        voterSession.pollId !== poll.id ||
        deviceState.voterIndex !== voterSession.voterIndex
    ) {
        return null;
    }

    const rosterEntry = poll.rosterEntries.find(
        (entry) =>
            entry.authPublicKey === deviceState.authPublicKey &&
            entry.transportPublicKey === deviceState.transportPublicKey,
    );

    if (!rosterEntry) {
        return null;
    }

    return {
        assignedParticipantIndex: rosterEntry.participantIndex,
        originalParticipantIndex: voterSession.voterIndex,
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

const countAcceptedMessages = (
    poll: PollResponse,
    messageType: SignedPayload['payload']['messageType'],
): number =>
    acceptedBoardPayloads(poll).filter((payload) =>
        isSignedPayloadOfType(payload, messageType),
    ).length;

const getAcceptedPayloadBySlotKey = (
    poll: PollResponse,
    slotKey: string,
): SignedPayload | null =>
    poll.boardEntries.find(
        (entry) =>
            entry.classification === 'accepted' && entry.slotKey === slotKey,
    )?.signedPayload ?? null;

const getStoredOrAcceptedPayload = ({
    deviceState,
    poll,
    slotKey,
}: {
    deviceState: StoredPollDeviceState;
    poll: PollResponse;
    slotKey: string;
}): SignedPayload | null =>
    getAcceptedPayloadBySlotKey(poll, slotKey) ??
    deviceState.pendingPayloads[slotKey] ??
    null;

const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const decodeLittleEndianScalar = (value: string): bigint => {
    const bytes = Uint8Array.from(
        value.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    );

    return bytes.reduce(
        (total, byte, index) => total + (BigInt(byte) << (8n * BigInt(index))),
        0n,
    );
};

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    );

    return bytesToHex(new Uint8Array(digest));
};

const deriveCoefficient = async ({
    coefficientIndex,
    domain,
    participantIndex,
    seedHex,
}: {
    coefficientIndex: number;
    domain: string;
    participantIndex: number;
    seedHex: string;
}): Promise<bigint> => {
    const material = await sha256Hex(
        `${seedHex}:${domain}:${participantIndex}:${coefficientIndex}`,
    );

    return modQ(BigInt(`0x${material}`), RISTRETTO_GROUP.q - 1n) + 1n;
};

const derivePolynomial = async ({
    participantIndex,
    seedHex,
    threshold,
}: {
    participantIndex: number;
    seedHex: string;
    threshold: number;
}): Promise<readonly bigint[]> =>
    await Promise.all(
        Array.from(
            { length: threshold },
            async (_value, offset) =>
                await deriveCoefficient({
                    coefficientIndex: offset + 1,
                    domain: 'polynomial',
                    participantIndex,
                    seedHex,
                }),
        ),
    );

const asEncodedAuthPublicKey = (value: string): EncodedAuthPublicKey =>
    value as EncodedAuthPublicKey;

const asEncodedTransportPublicKey = (
    value: string,
): EncodedTransportPublicKey => value as EncodedTransportPublicKey;

const deriveLocalDealerState = async ({
    deviceState,
    participantCount,
    participantIndex,
    threshold,
}: {
    deviceState: StoredPollDeviceState;
    participantCount: number;
    participantIndex: number;
    threshold: number;
}): Promise<LocalDealerState> => {
    const secretPolynomial = await derivePolynomial({
        participantIndex,
        seedHex: deviceState.dkgSecretSeed,
        threshold,
    });
    const blindingPolynomial = await derivePolynomial({
        participantIndex,
        seedHex: deviceState.dkgBlindingSeed,
        threshold,
    });

    return {
        blindingPolynomial,
        feldmanCommitments: generateFeldmanCommitments(
            secretPolynomial,
            RISTRETTO_GROUP,
        ),
        pedersenCommitments: generatePedersenCommitments(
            secretPolynomial,
            blindingPolynomial,
            RISTRETTO_GROUP,
        ),
        secretPolynomial,
        shares: derivePedersenShares(
            secretPolynomial,
            blindingPolynomial,
            participantCount,
            RISTRETTO_GROUP.q,
        ),
    };
};

const pruneAcceptedPendingPayloads = (
    pollId: string,
    poll: PollResponse,
): StoredPollDeviceState | null => {
    if (poll.sessionId) {
        prunePendingPayloadsForSession({
            pollId,
            sessionId: poll.sessionId,
        });
    }

    const acceptedSlotKeys = new Set(
        poll.boardEntries
            .filter((entry) => entry.classification === 'accepted')
            .map((entry) => entry.slotKey),
    );

    return updatePollDeviceState(pollId, (currentState) => ({
        ...currentState,
        pendingPayloads: Object.fromEntries(
            Object.entries(currentState.pendingPayloads).filter(
                ([slotKey]) => !acceptedSlotKeys.has(slotKey),
            ),
        ),
    }));
};

const wasResolutionAborted = (
    shouldAbort: ShouldAbortResolution | undefined,
): boolean => shouldAbort?.() ?? false;

const clearPendingPayload = (pollId: string, slotKey: string): void => {
    updatePollDeviceState(pollId, (currentState) => ({
        ...currentState,
        pendingPayloads: Object.fromEntries(
            Object.entries(currentState.pendingPayloads).filter(
                ([currentSlotKey]) => currentSlotKey !== slotKey,
            ),
        ),
    }));
};

const getOrCreatePreparedAction = async ({
    buildSignedPayload,
    deviceState,
    kind,
    poll,
    shouldAbort,
    slotKey,
}: {
    buildSignedPayload: () => Promise<SignedPayload>;
    deviceState: StoredPollDeviceState;
    kind: PreparedCeremonyAction['kind'];
    poll: PollResponse;
    shouldAbort?: ShouldAbortResolution;
    slotKey: string;
}): Promise<PreparedCeremonyAction | null> => {
    const existingPayload = getStoredOrAcceptedPayload({
        deviceState,
        poll,
        slotKey,
    });

    if (existingPayload) {
        return {
            kind,
            signedPayload: existingPayload,
            slotKey,
        };
    }

    if (wasResolutionAborted(shouldAbort)) {
        return null;
    }

    const signedPayload = await buildSignedPayload();

    if (wasResolutionAborted(shouldAbort)) {
        return null;
    }

    const persistedPayload =
        savePendingPayloadIfAbsent({
            pollId: poll.id,
            signedPayload,
            slotKey,
        }) ?? signedPayload;

    return {
        kind,
        signedPayload: persistedPayload,
        slotKey,
    };
};

const getAcceptedBallotPayloads = (
    poll: PollResponse,
): readonly SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'ballot-submission' }>
>[] =>
    acceptedBoardPayloads(poll).filter((payload) =>
        isSignedPayloadOfType(payload, 'ballot-submission'),
    ) as readonly SignedPayload<
        Extract<SignedPayload['payload'], { messageType: 'ballot-submission' }>
    >[];

const getAcceptedDecryptionSharePayloads = (
    poll: PollResponse,
): readonly SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'decryption-share' }>
>[] =>
    acceptedBoardPayloads(poll).filter((payload) =>
        isSignedPayloadOfType(payload, 'decryption-share'),
    ) as readonly SignedPayload<
        Extract<SignedPayload['payload'], { messageType: 'decryption-share' }>
    >[];

const getAcceptedTallyPayloads = (
    poll: PollResponse,
): readonly SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'tally-publication' }>
>[] =>
    acceptedBoardPayloads(poll).filter((payload) =>
        isSignedPayloadOfType(payload, 'tally-publication'),
    ) as readonly SignedPayload<
        Extract<SignedPayload['payload'], { messageType: 'tally-publication' }>
    >[];

const getAcceptedManifestPublication = (
    poll: PollResponse,
): SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'manifest-publication' }>
> | null =>
    acceptedBoardPayloads(poll).find((payload) =>
        isSignedPayloadOfType(payload, 'manifest-publication'),
    ) as SignedPayload<
        Extract<
            SignedPayload['payload'],
            { messageType: 'manifest-publication' }
        >
    > | null;

const getAcceptedBallotClose = (
    poll: PollResponse,
): SignedPayload<
    Extract<SignedPayload['payload'], { messageType: 'ballot-close' }>
> | null =>
    acceptedBoardPayloads(poll).find((payload) =>
        isSignedPayloadOfType(payload, 'ballot-close'),
    ) as SignedPayload<
        Extract<SignedPayload['payload'], { messageType: 'ballot-close' }>
    > | null;

const buildEncryptedShareEnvelopeId = (
    dealerIndex: number,
    recipientIndex: number,
): string => `env-${dealerIndex}-${recipientIndex}`;

const getLocalPayloadSlotKey = ({
    kind,
    optionIndex,
    participantIndex,
    recipientIndex,
    sessionId,
}: {
    kind: PreparedCeremonyAction['kind'];
    optionIndex?: number;
    participantIndex: number;
    recipientIndex?: number;
    sessionId: string;
}): string => {
    switch (kind) {
        case 'publish-registration':
            return `${sessionId}:0:${participantIndex}:registration`;
        case 'publish-manifest':
            return `${sessionId}:0:${participantIndex}:manifest-publication`;
        case 'accept-manifest':
            return `${sessionId}:0:${participantIndex}:manifest-acceptance`;
        case 'publish-pedersen-commitment':
            return `${sessionId}:1:${participantIndex}:pedersen-commitment`;
        case 'publish-encrypted-share':
            return `${sessionId}:1:${participantIndex}:encrypted-dual-share:${recipientIndex}`;
        case 'publish-feldman-commitment':
            return `${sessionId}:3:${participantIndex}:feldman-commitment`;
        case 'publish-key-confirmation':
            return `${sessionId}:4:${participantIndex}:key-derivation-confirmation`;
        case 'publish-ballot':
            return `${sessionId}:5:${participantIndex}:ballot-submission:${optionIndex}`;
        case 'publish-ballot-close':
            return `${sessionId}:6:ballot-close`;
        case 'publish-decryption-share':
            return `${sessionId}:7:${participantIndex}:decryption-share:${optionIndex}`;
        case 'publish-tally':
            return `${sessionId}:8:${participantIndex}:tally-publication:${optionIndex}`;
        default:
            return `${sessionId}:${participantIndex}:${kind}`;
    }
};

const deriveBallotParticipantSet = ({
    ballotPayloads,
    optionCount,
}: {
    ballotPayloads: readonly SignedPayload<
        Extract<SignedPayload['payload'], { messageType: 'ballot-submission' }>
    >[];
    optionCount: number;
}): readonly number[] => {
    const optionsByParticipant = new Map<number, Set<number>>();

    for (const payload of ballotPayloads) {
        const optionIndices =
            optionsByParticipant.get(payload.payload.participantIndex) ??
            new Set<number>();
        optionIndices.add(payload.payload.optionIndex);
        optionsByParticipant.set(
            payload.payload.participantIndex,
            optionIndices,
        );
    }

    return [...optionsByParticipant.entries()]
        .filter(([, optionIndices]) => optionIndices.size === optionCount)
        .map(([participantIndex]) => participantIndex)
        .sort((left, right) => left - right);
};

const buildDkgTranscript = (poll: PollResponse): readonly SignedPayload[] =>
    acceptedBoardPayloads(poll).filter(
        (payload) =>
            !isSignedPayloadOfType(payload, 'ballot-submission') &&
            !isSignedPayloadOfType(payload, 'ballot-close') &&
            !isSignedPayloadOfType(payload, 'decryption-share') &&
            !isSignedPayloadOfType(payload, 'tally-publication'),
    );

const getVerifiedDkg = async (
    poll: PollResponse,
): Promise<Awaited<ReturnType<typeof verifyDKGTranscript>> | null> => {
    if (!poll.manifest || !poll.sessionId) {
        return null;
    }

    if (
        countAcceptedMessages(poll, 'key-derivation-confirmation') <
        poll.ceremony.activeParticipantCount
    ) {
        return null;
    }

    return await verifyDKGTranscript({
        transcript: buildDkgTranscript(poll),
        manifest: poll.manifest,
        sessionId: poll.sessionId,
    });
};

const buildFeldmanProofs = async ({
    commitments,
    manifestHash,
    participantIndex,
    secretPolynomial,
    sessionId,
}: {
    commitments: readonly EncodedPoint[];
    manifestHash: string;
    participantIndex: number;
    secretPolynomial: readonly bigint[];
    sessionId: string;
}): Promise<
    readonly {
        coefficientIndex: number;
        challenge: bigint;
        response: bigint;
    }[]
> =>
    await Promise.all(
        secretPolynomial.map(async (coefficient, offset) => {
            const coefficientIndex = offset + 1;
            const context: ProofContext = {
                protocolVersion: SHIPPED_PROTOCOL_VERSION,
                suiteId: RISTRETTO_GROUP.name,
                manifestHash,
                sessionId,
                label: 'feldman-coefficient-proof',
                participantIndex,
                coefficientIndex,
            };
            const proof = await createSchnorrProof(
                coefficient,
                commitments[offset],
                RISTRETTO_GROUP,
                context,
            );

            return {
                coefficientIndex,
                challenge: proof.challenge,
                response: proof.response,
            };
        }),
    );

const deriveLocalAcceptedShareContributions = async ({
    deviceState,
    participantIndex,
    poll,
    verifiedDkg,
}: {
    deviceState: StoredPollDeviceState;
    participantIndex: number;
    poll: PollResponse;
    verifiedDkg: Awaited<ReturnType<typeof verifyDKGTranscript>>;
}): Promise<AcceptedShareContribution[]> => {
    const threshold = majorityThreshold(poll.ceremony.activeParticipantCount);
    const localDealerState = await deriveLocalDealerState({
        deviceState,
        participantCount: poll.ceremony.activeParticipantCount,
        participantIndex,
        threshold,
    });
    const transportPrivateKey =
        await restoreStoredTransportPrivateKey(deviceState);
    const encryptedShares = acceptedBoardPayloads(poll).filter((payload) =>
        isSignedPayloadOfType(payload, 'encrypted-dual-share'),
    );
    const pedersenCommitmentsByDealer = new Map(
        acceptedBoardPayloads(poll)
            .filter((payload) =>
                isSignedPayloadOfType(payload, 'pedersen-commitment'),
            )
            .map((payload) => [
                payload.payload.participantIndex,
                payload.payload.commitments as readonly EncodedPoint[],
            ]),
    );
    const feldmanCommitmentsByDealer = new Map(
        verifiedDkg.feldmanCommitments.map((entry) => [
            entry.dealerIndex,
            entry.commitments,
        ]),
    );

    const contributions: AcceptedShareContribution[] = [
        {
            dealerIndex: participantIndex,
            share: localDealerState.shares[participantIndex - 1],
        },
    ];

    for (const dealerIndex of verifiedDkg.qual) {
        if (dealerIndex === participantIndex) {
            continue;
        }

        const envelopePayload = encryptedShares.find(
            (payload) =>
                payload.payload.participantIndex === dealerIndex &&
                payload.payload.recipientIndex === participantIndex,
        );

        if (!envelopePayload) {
            throw new Error(
                `Missing encrypted share payload from dealer ${dealerIndex} for participant ${participantIndex}.`,
            );
        }

        const plaintext = await decryptEnvelope(
            {
                sessionId: envelopePayload.payload.sessionId,
                rosterHash: poll.manifest!.rosterHash,
                phase: envelopePayload.payload.phase,
                dealerIndex,
                recipientIndex: participantIndex,
                envelopeId: envelopePayload.payload.envelopeId,
                payloadType: 'encrypted-dual-share',
                protocolVersion: SHIPPED_PROTOCOL_VERSION,
                suite: envelopePayload.payload.suite,
                ephemeralPublicKey: envelopePayload.payload.ephemeralPublicKey,
                iv: envelopePayload.payload.iv,
                ciphertext: envelopePayload.payload.ciphertext,
            },
            transportPrivateKey,
        );
        const share = decodePedersenShareEnvelope(
            plaintext,
            participantIndex,
            `dealer-${dealerIndex}`,
        );
        const pedersenCommitments =
            pedersenCommitmentsByDealer.get(dealerIndex);
        const feldmanCommitments = feldmanCommitmentsByDealer.get(dealerIndex);

        if (
            !pedersenCommitments ||
            !verifyPedersenShare(
                share,
                { commitments: pedersenCommitments },
                RISTRETTO_GROUP,
            )
        ) {
            throw new Error(
                `Pedersen verification failed for dealer ${dealerIndex}.`,
            );
        }

        if (
            !feldmanCommitments ||
            !verifyFeldmanShare(
                {
                    index: participantIndex,
                    value: share.secretValue,
                },
                { commitments: feldmanCommitments },
                RISTRETTO_GROUP,
            )
        ) {
            throw new Error(
                `Feldman verification failed for dealer ${dealerIndex}.`,
            );
        }

        contributions.push({
            dealerIndex,
            share,
        });
    }

    return contributions;
};

const buildVerifiedBallotsForReveal = async ({
    poll,
    verifiedDkg,
}: {
    poll: PollResponse;
    verifiedDkg: Awaited<ReturnType<typeof verifyDKGTranscript>>;
}): Promise<Awaited<
    ReturnType<typeof verifyBallotSubmissionPayloadsByOption>
> | null> => {
    const ballotClosePayload = getAcceptedBallotClose(poll);

    const manifest = poll.manifest;
    const sessionId = poll.sessionId;

    if (!ballotClosePayload || !manifest || !sessionId) {
        return null;
    }

    const countedSet = new Set(
        ballotClosePayload.payload.includedParticipantIndices,
    );
    const countedBallotPayloads = getAcceptedBallotPayloads(poll).filter(
        (payload) => countedSet.has(payload.payload.participantIndex),
    );

    return await verifyBallotSubmissionPayloadsByOption({
        ballotPayloads: countedBallotPayloads,
        publicKey: verifiedDkg.derivedPublicKey,
        manifest,
        sessionId,
    });
};

const parseCompactProof = (proof: {
    challenge: string;
    response: string;
}): { challenge: bigint; response: bigint } => ({
    challenge: decodeLittleEndianScalar(proof.challenge),
    response: decodeLittleEndianScalar(proof.response),
});

const selectCanonicalDecryptionShares = ({
    threshold,
    validShares,
}: {
    threshold: number;
    validShares: readonly {
        index: number;
        value: EncodedPoint;
    }[];
}):
    | readonly {
          index: number;
          value: EncodedPoint;
      }[]
    | null => {
    if (validShares.length < threshold) {
        return null;
    }

    return [...validShares]
        .sort((left, right) => left.index - right.index)
        .slice(0, threshold);
};

const selectCanonicalParticipantIndices = ({
    participantIndices,
    threshold,
}: {
    participantIndices: readonly number[];
    threshold: number;
}): readonly number[] =>
    [...participantIndices]
        .sort((left, right) => left - right)
        .slice(0, threshold);

const createRevealBallotCloseActionInternal = async ({
    creatorSession,
    deviceState,
    poll,
    shouldAbort,
    voterSession,
}: {
    creatorSession: StoredCreatorSession | null;
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse;
    shouldAbort?: ShouldAbortResolution;
    voterSession: StoredVoterSession | null;
}): Promise<PreparedCeremonyAction | null> => {
    const manifestHash = poll.manifestHash;
    const sessionId = poll.sessionId;
    const localCeremonyParticipant = findLocalCeremonyParticipant({
        deviceState,
        poll,
        voterSession,
    });

    if (
        !creatorSession ||
        !deviceState ||
        !deviceState.isCreatorParticipant ||
        !voterSession ||
        !localCeremonyParticipant ||
        !poll.ceremony.revealReady ||
        !manifestHash ||
        !sessionId ||
        creatorSession.pollId !== poll.id
    ) {
        return null;
    }

    const participantIndices = deriveBallotParticipantSet({
        ballotPayloads: getAcceptedBallotPayloads(poll),
        optionCount: poll.choices.length,
    });

    if (participantIndices.length !== poll.ceremony.activeParticipantCount) {
        return null;
    }

    const slotKey = getLocalPayloadSlotKey({
        kind: 'publish-ballot-close',
        participantIndex: localCeremonyParticipant.assignedParticipantIndex,
        sessionId,
    });
    const authPrivateKey = await importStoredAuthPrivateKey(
        deviceState.authPrivateKeyPkcs8,
    );

    return await getOrCreatePreparedAction({
        buildSignedPayload: async () =>
            await createBallotClosePayload(authPrivateKey, {
                sessionId,
                manifestHash,
                participantIndex:
                    localCeremonyParticipant.assignedParticipantIndex,
                includedParticipantIndices: participantIndices,
            }),
        deviceState,
        kind: 'publish-ballot-close',
        poll,
        shouldAbort,
        slotKey,
    });
};

export const resolveAutomaticCeremonyAction = async ({
    creatorSession,
    deviceState,
    poll,
    shouldAbort,
    voterSession,
}: {
    creatorSession: StoredCreatorSession | null;
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse;
    shouldAbort?: ShouldAbortResolution;
    voterSession: StoredVoterSession | null;
}): Promise<PreparedCeremonyAction | null> => {
    if (!deviceState || !voterSession) {
        return null;
    }

    const manifest = poll.manifest;
    const manifestHash = poll.manifestHash;
    const sessionId = poll.sessionId;
    const localCeremonyParticipant = findLocalCeremonyParticipant({
        deviceState,
        poll,
        voterSession,
    });

    if (!manifest || !manifestHash || !sessionId || !localCeremonyParticipant) {
        return null;
    }

    if (wasResolutionAborted(shouldAbort)) {
        return null;
    }

    pruneAcceptedPendingPayloads(poll.id, poll);

    const participantIndex = localCeremonyParticipant.assignedParticipantIndex;
    const authPrivateKey = await importStoredAuthPrivateKey(
        deviceState.authPrivateKeyPkcs8,
    );
    const threshold = majorityThreshold(poll.ceremony.activeParticipantCount);
    let localDealerStatePromise: Promise<LocalDealerState> | null = null;
    const getLocalDealerState = async (): Promise<LocalDealerState> => {
        localDealerStatePromise ??= deriveLocalDealerState({
            deviceState,
            participantCount: poll.ceremony.activeParticipantCount,
            participantIndex,
            threshold,
        });

        return await localDealerStatePromise;
    };
    const acceptedPayloads = acceptedBoardPayloads(poll);

    const registrationSlotKey = getLocalPayloadSlotKey({
        kind: 'publish-registration',
        participantIndex,
        sessionId,
    });

    if (!getAcceptedPayloadBySlotKey(poll, registrationSlotKey)) {
        return await getOrCreatePreparedAction({
            buildSignedPayload: async () =>
                await createRegistrationPayload(authPrivateKey, {
                    authPublicKey: asEncodedAuthPublicKey(
                        deviceState.authPublicKey,
                    ),
                    manifestHash,
                    participantIndex,
                    rosterHash: manifest.rosterHash,
                    sessionId,
                    transportPublicKey: asEncodedTransportPublicKey(
                        deviceState.transportPublicKey,
                    ),
                }),
            deviceState,
            kind: 'publish-registration',
            poll,
            shouldAbort,
            slotKey: registrationSlotKey,
        });
    }

    const manifestPublication = getAcceptedManifestPublication(poll);
    const creatorIsLocalParticipant =
        creatorSession?.pollId === poll.id && deviceState.isCreatorParticipant;

    if (
        creatorIsLocalParticipant &&
        countAcceptedMessages(poll, 'registration') ===
            poll.ceremony.activeParticipantCount &&
        !manifestPublication
    ) {
        const slotKey = getLocalPayloadSlotKey({
            kind: 'publish-manifest',
            participantIndex,
            sessionId,
        });

        return await getOrCreatePreparedAction({
            buildSignedPayload: async () =>
                await createManifestPublicationPayload(authPrivateKey, {
                    manifest,
                    manifestHash,
                    participantIndex,
                    sessionId,
                }),
            deviceState,
            kind: 'publish-manifest',
            poll,
            shouldAbort,
            slotKey,
        });
    }

    if (manifestPublication) {
        const manifestAcceptanceSlotKey = getLocalPayloadSlotKey({
            kind: 'accept-manifest',
            participantIndex,
            sessionId,
        });

        if (!getAcceptedPayloadBySlotKey(poll, manifestAcceptanceSlotKey)) {
            return await getOrCreatePreparedAction({
                buildSignedPayload: async () =>
                    await createManifestAcceptancePayload(authPrivateKey, {
                        assignedParticipantIndex: participantIndex,
                        manifestHash,
                        participantIndex,
                        rosterHash: manifest.rosterHash,
                        sessionId,
                    }),
                deviceState,
                kind: 'accept-manifest',
                poll,
                shouldAbort,
                slotKey: manifestAcceptanceSlotKey,
            });
        }
    } else {
        return null;
    }

    if (
        countAcceptedMessages(poll, 'manifest-acceptance') <
        poll.ceremony.activeParticipantCount
    ) {
        return null;
    }

    const pedersenSlotKey = getLocalPayloadSlotKey({
        kind: 'publish-pedersen-commitment',
        participantIndex,
        sessionId,
    });

    if (!getAcceptedPayloadBySlotKey(poll, pedersenSlotKey)) {
        return await getOrCreatePreparedAction({
            buildSignedPayload: async () => {
                const localDealerState = await getLocalDealerState();

                return await createPedersenCommitmentPayload(authPrivateKey, {
                    sessionId,
                    manifestHash,
                    participantIndex,
                    commitments:
                        localDealerState.pedersenCommitments.commitments,
                });
            },
            deviceState,
            kind: 'publish-pedersen-commitment',
            poll,
            shouldAbort,
            slotKey: pedersenSlotKey,
        });
    }

    for (const recipient of poll.rosterEntries) {
        if (recipient.participantIndex === participantIndex) {
            continue;
        }

        const slotKey = getLocalPayloadSlotKey({
            kind: 'publish-encrypted-share',
            participantIndex,
            recipientIndex: recipient.participantIndex,
            sessionId,
        });

        if (getAcceptedPayloadBySlotKey(poll, slotKey)) {
            continue;
        }

        return await getOrCreatePreparedAction({
            buildSignedPayload: async () => {
                const localDealerState = await getLocalDealerState();
                const envelopeId = buildEncryptedShareEnvelopeId(
                    participantIndex,
                    recipient.participantIndex,
                );
                const plaintext = new TextEncoder().encode(
                    encodePedersenShareEnvelope(
                        localDealerState.shares[recipient.participantIndex - 1],
                        RISTRETTO_GROUP.byteLength,
                    ),
                );
                const { envelope } = await encryptEnvelope(
                    plaintext,
                    asEncodedTransportPublicKey(recipient.transportPublicKey),
                    {
                        sessionId,
                        rosterHash: manifest.rosterHash,
                        phase: 1,
                        dealerIndex: participantIndex,
                        recipientIndex: recipient.participantIndex,
                        envelopeId,
                        payloadType: 'encrypted-dual-share',
                        protocolVersion: SHIPPED_PROTOCOL_VERSION,
                        suite: 'X25519',
                    },
                );

                return await createEncryptedDualSharePayload(authPrivateKey, {
                    sessionId,
                    manifestHash,
                    participantIndex,
                    recipientIndex: recipient.participantIndex,
                    envelopeId: envelope.envelopeId,
                    suite: envelope.suite,
                    ephemeralPublicKey: envelope.ephemeralPublicKey,
                    iv: envelope.iv,
                    ciphertext: envelope.ciphertext,
                });
            },
            deviceState,
            kind: 'publish-encrypted-share',
            poll,
            shouldAbort,
            slotKey,
        });
    }

    if (
        countAcceptedMessages(poll, 'pedersen-commitment') <
            poll.ceremony.activeParticipantCount ||
        countAcceptedMessages(poll, 'encrypted-dual-share') <
            poll.ceremony.activeParticipantCount *
                (poll.ceremony.activeParticipantCount - 1)
    ) {
        return null;
    }

    const feldmanSlotKey = getLocalPayloadSlotKey({
        kind: 'publish-feldman-commitment',
        participantIndex,
        sessionId,
    });

    if (!getAcceptedPayloadBySlotKey(poll, feldmanSlotKey)) {
        return await getOrCreatePreparedAction({
            buildSignedPayload: async () => {
                const localDealerState = await getLocalDealerState();

                return await createFeldmanCommitmentPayload(authPrivateKey, {
                    sessionId,
                    manifestHash,
                    participantIndex,
                    commitments:
                        localDealerState.feldmanCommitments.commitments,
                    proofs: await buildFeldmanProofs({
                        commitments:
                            localDealerState.feldmanCommitments.commitments,
                        manifestHash,
                        participantIndex,
                        secretPolynomial: localDealerState.secretPolynomial,
                        sessionId,
                    }),
                });
            },
            deviceState,
            kind: 'publish-feldman-commitment',
            poll,
            shouldAbort,
            slotKey: feldmanSlotKey,
        });
    }

    if (
        countAcceptedMessages(poll, 'feldman-commitment') <
        poll.ceremony.activeParticipantCount
    ) {
        return null;
    }

    const keyConfirmationSlotKey = getLocalPayloadSlotKey({
        kind: 'publish-key-confirmation',
        participantIndex,
        sessionId,
    });

    if (!getAcceptedPayloadBySlotKey(poll, keyConfirmationSlotKey)) {
        return await getOrCreatePreparedAction({
            buildSignedPayload: async () => {
                const dkgTranscriptWithoutConfirmations =
                    acceptedPayloads.filter(
                        (payload) =>
                            payload.payload.messageType !==
                            'key-derivation-confirmation',
                    );
                const qualHash = await hashProtocolTranscript(
                    sortProtocolPayloads(
                        dkgTranscriptWithoutConfirmations.map(
                            (payload) => payload.payload,
                        ),
                    ),
                );
                const feldmanCommitments = acceptedPayloads
                    .filter((payload) =>
                        isSignedPayloadOfType(payload, 'feldman-commitment'),
                    )
                    .map((payload) => ({
                        dealerIndex: payload.payload.participantIndex,
                        commitments: payload.payload
                            .commitments as readonly EncodedPoint[],
                    }));

                return await createKeyDerivationConfirmationPayload(
                    authPrivateKey,
                    {
                        sessionId,
                        manifestHash,
                        participantIndex,
                        qualHash,
                        publicKey: deriveJointPublicKey(
                            feldmanCommitments,
                            RISTRETTO_GROUP,
                        ),
                    },
                );
            },
            deviceState,
            kind: 'publish-key-confirmation',
            poll,
            shouldAbort,
            slotKey: keyConfirmationSlotKey,
        });
    }

    const verifiedDkg = await getVerifiedDkg(poll);
    if (!verifiedDkg) {
        return null;
    }

    const ballotScores = deviceState.storedBallotScores;
    if (ballotScores && ballotScores.length === poll.choices.length) {
        for (let offset = 0; offset < ballotScores.length; offset += 1) {
            const optionIndex = offset + 1;
            const slotKey = getLocalPayloadSlotKey({
                kind: 'publish-ballot',
                optionIndex,
                participantIndex,
                sessionId,
            });

            if (getAcceptedPayloadBySlotKey(poll, slotKey)) {
                continue;
            }

            return await getOrCreatePreparedAction({
                buildSignedPayload: async () => {
                    const vote = BigInt(ballotScores[offset]);
                    const randomness = await deriveCoefficient({
                        coefficientIndex: optionIndex,
                        domain: 'ballot',
                        participantIndex,
                        seedHex: deviceState.dkgBlindingSeed,
                    });
                    const ciphertext = encryptAdditiveWithRandomness(
                        vote,
                        verifiedDkg.derivedPublicKey,
                        randomness,
                        10n,
                    );
                    const context: ProofContext = {
                        protocolVersion: SHIPPED_PROTOCOL_VERSION,
                        suiteId: RISTRETTO_GROUP.name,
                        manifestHash,
                        sessionId,
                        label: 'ballot-range-proof',
                        voterIndex: participantIndex,
                        optionIndex,
                    };
                    const proof = await createDisjunctiveProof(
                        vote,
                        randomness,
                        ciphertext,
                        verifiedDkg.derivedPublicKey,
                        scoreVotingDomain(),
                        RISTRETTO_GROUP,
                        context,
                    );

                    return await createBallotSubmissionPayload(authPrivateKey, {
                        sessionId,
                        manifestHash,
                        participantIndex,
                        optionIndex,
                        ciphertext,
                        proof,
                    });
                },
                deviceState,
                kind: 'publish-ballot',
                poll,
                shouldAbort,
                slotKey,
            });
        }

        if (wasResolutionAborted(shouldAbort)) {
            return null;
        }
    }

    if (!getAcceptedBallotClose(poll) && creatorIsLocalParticipant) {
        const revealAction = await createRevealBallotCloseActionInternal({
            creatorSession,
            deviceState,
            poll,
            shouldAbort,
            voterSession,
        });

        if (revealAction) {
            return revealAction;
        }
    }

    const ballotClosePayload = getAcceptedBallotClose(poll);
    if (!ballotClosePayload) {
        return null;
    }

    if (
        !ballotClosePayload.payload.includedParticipantIndices.includes(
            participantIndex,
        )
    ) {
        return null;
    }

    const verifiedBallotsByOption = await buildVerifiedBallotsForReveal({
        poll,
        verifiedDkg,
    });

    if (!verifiedBallotsByOption) {
        return null;
    }

    const selectedDecryptionParticipantIndices =
        selectCanonicalParticipantIndices({
            participantIndices:
                ballotClosePayload.payload.includedParticipantIndices,
            threshold:
                poll.thresholds.minimumPublishedVoterCount ??
                majorityThreshold(poll.ceremony.activeParticipantCount),
        });
    const selectedDecryptionParticipantSet = new Set(
        selectedDecryptionParticipantIndices,
    );

    if (selectedDecryptionParticipantSet.has(participantIndex)) {
        const localContributions = await deriveLocalAcceptedShareContributions({
            deviceState,
            participantIndex,
            poll,
            verifiedDkg,
        });
        const finalShare = deriveFinalShare({
            contributions: localContributions,
            participantIndex,
        });

        for (const optionBallots of verifiedBallotsByOption) {
            const slotKey = getLocalPayloadSlotKey({
                kind: 'publish-decryption-share',
                optionIndex: optionBallots.optionIndex,
                participantIndex,
                sessionId,
            });

            if (getAcceptedPayloadBySlotKey(poll, slotKey)) {
                continue;
            }

            return await getOrCreatePreparedAction({
                buildSignedPayload: async () => {
                    const verifiedShare = createVerifiedDecryptionShare(
                        optionBallots.aggregate,
                        finalShare,
                    );
                    const statement: DLEQStatement = {
                        publicKey: deriveTranscriptVerificationKey(
                            verifiedDkg.feldmanCommitments,
                            participantIndex,
                            RISTRETTO_GROUP,
                        ),
                        ciphertext: optionBallots.aggregate.ciphertext,
                        decryptionShare: verifiedShare.value,
                    };
                    const context: ProofContext = {
                        protocolVersion: SHIPPED_PROTOCOL_VERSION,
                        suiteId: RISTRETTO_GROUP.name,
                        manifestHash,
                        sessionId,
                        label: 'decryption-share-dleq',
                        participantIndex,
                        optionIndex: optionBallots.optionIndex,
                    };
                    const proof = await createDLEQProof(
                        finalShare.value,
                        statement,
                        RISTRETTO_GROUP,
                        context,
                    );

                    return await createDecryptionSharePayload(authPrivateKey, {
                        sessionId,
                        manifestHash,
                        participantIndex,
                        optionIndex: optionBallots.optionIndex,
                        transcriptHash: optionBallots.aggregate.transcriptHash,
                        ballotCount: optionBallots.aggregate.ballotCount,
                        decryptionShare: verifiedShare.value,
                        proof,
                    });
                },
                deviceState,
                kind: 'publish-decryption-share',
                poll,
                shouldAbort,
                slotKey,
            });
        }
    }

    if (!creatorIsLocalParticipant) {
        return null;
    }

    const acceptedDecryptionSharePayloads =
        getAcceptedDecryptionSharePayloads(poll);
    const acceptedTallyPayloads = getAcceptedTallyPayloads(poll);

    for (const optionBallots of verifiedBallotsByOption) {
        const slotKey = getLocalPayloadSlotKey({
            kind: 'publish-tally',
            optionIndex: optionBallots.optionIndex,
            participantIndex,
            sessionId,
        });

        if (getAcceptedPayloadBySlotKey(poll, slotKey)) {
            continue;
        }

        if (
            acceptedTallyPayloads.some(
                (payload) =>
                    payload.payload.optionIndex === optionBallots.optionIndex,
            )
        ) {
            continue;
        }

        const validShares = await Promise.all(
            acceptedDecryptionSharePayloads
                .filter(
                    (payload) =>
                        selectedDecryptionParticipantSet.has(
                            payload.payload.participantIndex,
                        ) &&
                        payload.payload.optionIndex ===
                            optionBallots.optionIndex,
                )
                .map(async (payload) => {
                    const statement: DLEQStatement = {
                        publicKey: deriveTranscriptVerificationKey(
                            verifiedDkg.feldmanCommitments,
                            payload.payload.participantIndex,
                            RISTRETTO_GROUP,
                        ),
                        ciphertext: optionBallots.aggregate.ciphertext,
                        decryptionShare: payload.payload.decryptionShare,
                    };
                    const context: ProofContext = {
                        protocolVersion: SHIPPED_PROTOCOL_VERSION,
                        suiteId: RISTRETTO_GROUP.name,
                        manifestHash,
                        sessionId,
                        label: 'decryption-share-dleq',
                        participantIndex: payload.payload.participantIndex,
                        optionIndex: optionBallots.optionIndex,
                    };
                    const verified = await verifyDLEQProof(
                        parseCompactProof(payload.payload.proof),
                        statement,
                        RISTRETTO_GROUP,
                        context,
                    );

                    return verified
                        ? {
                              index: payload.payload.participantIndex,
                              value: payload.payload.decryptionShare,
                          }
                        : null;
                }),
        );

        const selectedShares = selectCanonicalDecryptionShares({
            threshold: selectedDecryptionParticipantIndices.length,
            validShares: validShares.filter(
                (share): share is { index: number; value: EncodedPoint } =>
                    share !== null,
            ),
        });

        if (
            !selectedShares ||
            selectedShares.some(
                (share, index) =>
                    share.index !== selectedDecryptionParticipantIndices[index],
            )
        ) {
            return null;
        }

        return await getOrCreatePreparedAction({
            buildSignedPayload: async () =>
                await createTallyPublicationPayload(authPrivateKey, {
                    sessionId,
                    manifestHash,
                    participantIndex,
                    optionIndex: optionBallots.optionIndex,
                    transcriptHash: optionBallots.aggregate.transcriptHash,
                    ballotCount: optionBallots.aggregate.ballotCount,
                    tally: combineDecryptionShares(
                        optionBallots.aggregate.ciphertext,
                        selectedShares,
                        BigInt(optionBallots.aggregate.ballotCount) * 10n,
                    ),
                    decryptionParticipantIndices: selectedShares.map(
                        (share) => share.index,
                    ),
                }),
            deviceState,
            kind: 'publish-tally',
            poll,
            shouldAbort,
            slotKey,
        });
    }

    return null;
};

export const createRevealBallotCloseAction =
    createRevealBallotCloseActionInternal;
export { selectCanonicalDecryptionShares };

export const describeAutomaticCeremonyAction = (
    action: PreparedCeremonyAction | null,
): string | null => {
    if (!action) {
        return null;
    }

    switch (action.kind) {
        case 'publish-registration':
            return 'Registering your device on the sealed ceremony board.';
        case 'publish-manifest':
            return 'Freezing the shared manifest for the final submitted roster.';
        case 'accept-manifest':
            return 'Confirming the frozen manifest before secure setup continues.';
        case 'publish-pedersen-commitment':
            return 'Publishing your encrypted share commitments.';
        case 'publish-encrypted-share':
            return 'Sending your encrypted DKG shares to the rest of the group.';
        case 'publish-feldman-commitment':
            return 'Publishing your extracted public commitments and coefficient proofs.';
        case 'publish-key-confirmation':
            return 'Confirming the shared public key derived from the DKG transcript.';
        case 'publish-ballot':
            return 'Encrypting your stored scores and publishing your ballot.';
        case 'publish-decryption-share':
            return 'Publishing your threshold decryption share for the reveal.';
        case 'publish-tally':
            return 'Publishing the final verified tally for one option.';
        case 'publish-ballot-close':
            return 'Closing the counted ballot set so the results can be opened.';
        default:
            return null;
    }
};

export const clearCommittedPendingPayload = ({
    pollId,
    slotKey,
}: {
    pollId: string;
    slotKey: string;
}): void => {
    clearPendingPayload(pollId, slotKey);
};

export type { PreparedCeremonyAction };
