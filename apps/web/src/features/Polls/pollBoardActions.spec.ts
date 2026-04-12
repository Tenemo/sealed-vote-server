import type { PollResponse } from '@sealed-vote/contracts';

import {
    createRevealBallotCloseAction,
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
    selectCanonicalDecryptionShares,
} from './pollBoardActions';

import {
    createPendingPollDeviceState,
    createPollDeviceState,
    type StoredPollDeviceState,
} from 'features/Polls/pollDeviceStorage';
import type {
    StoredCreatorSession,
    StoredVoterSession,
} from 'features/Polls/pollSessionStorage';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse => ({
    id: 'poll-1',
    slug: 'best-fruit--1111',
    pollName: 'Best fruit',
    createdAt: '2026-04-11T10:00:00.000Z',
    isOpen: false,
    choices: ['Apples', 'Bananas'],
    voters: [
        {
            ceremonyState: 'active',
            deviceReady: true,
            voterIndex: 1,
            voterName: 'Alice',
        },
        {
            ceremonyState: 'active',
            deviceReady: true,
            voterIndex: 2,
            voterName: 'Bob',
        },
        {
            ceremonyState: 'active',
            deviceReady: true,
            voterIndex: 3,
            voterName: 'Cora',
        },
    ],
    manifest: {
        optionList: ['Apples', 'Bananas'],
        rosterHash: 'a'.repeat(64),
    },
    manifestHash: 'b'.repeat(64),
    sessionId: 'c'.repeat(64),
    sessionFingerprint: 'ABCD-EF12-3456-7890-ABCD-EF12-3456-7890',
    phase: 'securing',
    submittedParticipantCount: 3,
    minimumCloseParticipantCount: 3,
    ceremony: {
        acceptedDecryptionShareCount: 0,
        acceptedEncryptedBallotCount: 0,
        acceptedRegistrationCount: 0,
        activeParticipantCount: 3,
        blockingParticipantIndices: [],
        completeEncryptedBallotParticipantCount: 0,
        revealReady: false,
        restartCount: 0,
    },
    boardAudit: {
        acceptedCount: 0,
        duplicateCount: 0,
        equivocationCount: 0,
        ceremonyDigest: null,
        phaseDigests: [],
    },
    verification: {
        status: 'not-ready',
        reason: null,
        qualParticipantIndices: [],
        verifiedOptionTallies: [],
    },
    boardEntries: [],
    rosterEntries: [
        {
            authPublicKey: 'auth-1',
            participantIndex: 1,
            transportPublicKey: 'transport-1',
            transportSuite: 'X25519',
            voterName: 'Alice',
        },
        {
            authPublicKey: 'auth-2',
            participantIndex: 2,
            transportPublicKey: 'transport-2',
            transportSuite: 'X25519',
            voterName: 'Bob',
        },
        {
            authPublicKey: 'auth-3',
            participantIndex: 3,
            transportPublicKey: 'transport-3',
            transportSuite: 'X25519',
            voterName: 'Cora',
        },
    ],
    thresholds: {
        reconstructionThreshold: 2,
        minimumPublishedVoterCount: 2,
        maxParticipants: 51,
        validationTarget: 15,
    },
    ...overrides,
});

const createDeviceState = (
    overrides: Partial<StoredPollDeviceState> = {},
): StoredPollDeviceState => ({
    authPrivateKeyPkcs8: '1'.repeat(64),
    authPublicKey: 'auth-2',
    dkgBlindingSeed: '2'.repeat(64),
    dkgSecretSeed: '3'.repeat(64),
    isCreatorParticipant: false,
    pendingPayloads: {},
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    storedBallotScores: [8, 6],
    transportPrivateKeyPkcs8: '4'.repeat(64),
    transportPublicKey: 'transport-2',
    transportSuite: 'X25519',
    voterIndex: 2,
    voterName: 'Bob',
    voterToken: 'token-2',
    ...overrides,
});

const createValidDeviceState = async (
    overrides: Omit<Partial<StoredPollDeviceState>, 'storedBallotScores'> & {
        storedBallotScores?: number[];
    } = {},
): Promise<StoredPollDeviceState> => {
    const pendingState = await createPendingPollDeviceState();

    return await createPollDeviceState({
        pendingState,
        pollId: 'poll-1',
        pollSlug: 'best-fruit--1111',
        storedBallotScores: [8, 6],
        voterIndex: 1,
        voterName: 'Alice',
        voterToken: 'token-1',
        isCreatorParticipant: true,
        ...overrides,
    });
};

const createVoterSession = (
    overrides: Partial<StoredVoterSession> = {},
): StoredVoterSession => ({
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    voterIndex: 2,
    voterName: 'Bob',
    voterToken: 'token-2',
    ...overrides,
});

const createCreatorSession = (
    overrides: Partial<StoredCreatorSession> = {},
): StoredCreatorSession => ({
    creatorToken: 'creator-token',
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    ...overrides,
});

const createAcceptedBallotEntry = ({
    entryId,
    optionIndex,
    participantIndex,
}: {
    entryId: string;
    optionIndex: number;
    participantIndex: number;
}): PollResponse['boardEntries'][number] => ({
    id: entryId,
    createdAt: '2026-04-11T10:10:00.000Z',
    phase: 5,
    participantIndex,
    messageType: 'ballot-submission',
    slotKey: `c${participantIndex}:${optionIndex}`,
    unsignedHash: `hash-${entryId}`,
    previousEntryHash: null,
    entryHash: `entry-${entryId}`,
    classification: 'accepted',
    signedPayload: {
        payload: {
            ciphertext: {
                c1: `c1-${entryId}` as never,
                c2: `c2-${entryId}` as never,
            },
            manifestHash: 'b'.repeat(64),
            messageType: 'ballot-submission',
            optionIndex,
            participantIndex,
            phase: 5,
            proof: [] as never,
            sessionId: 'c'.repeat(64),
        },
        signature: 'd'.repeat(128),
    },
});

describe('pollBoardActions', () => {
    it('returns null while voting is still open', async () => {
        await expect(
            resolveAutomaticCeremonyAction({
                creatorSession: null,
                deviceState: createDeviceState(),
                poll: createPoll({
                    isOpen: true,
                    manifest: null,
                    manifestHash: null,
                    phase: 'open',
                    sessionId: null,
                }),
                voterSession: createVoterSession(),
            }),
        ).resolves.toBeNull();
    });

    it('describes the background steps in plain language', () => {
        expect(
            describeAutomaticCeremonyAction({
                kind: 'publish-registration',
                signedPayload: {
                    payload: {
                        manifestHash: 'a'.repeat(64),
                        messageType: 'registration',
                        participantIndex: 1,
                        phase: 0,
                        rosterHash: 'b'.repeat(64),
                        sessionId: 'c'.repeat(64),
                        authPublicKey: 'auth-1' as never,
                        transportPublicKey: 'transport-1' as never,
                    },
                    signature: 'd'.repeat(128),
                },
                slotKey: 'slot-1',
            }),
        ).toContain('Registering your device');
    });

    it('refuses to create a reveal action before enough encrypted ballots exist', async () => {
        await expect(
            createRevealBallotCloseAction({
                creatorSession: createCreatorSession(),
                deviceState: createDeviceState({
                    isCreatorParticipant: true,
                }),
                poll: createPoll({
                    ceremony: {
                        acceptedDecryptionShareCount: 0,
                        acceptedEncryptedBallotCount: 2,
                        acceptedRegistrationCount: 3,
                        activeParticipantCount: 3,
                        blockingParticipantIndices: [3],
                        completeEncryptedBallotParticipantCount: 1,
                        revealReady: false,
                        restartCount: 0,
                    },
                }),
                voterSession: createVoterSession(),
            }),
        ).resolves.toBeNull();
    });

    it('creates a reveal action only after every submitted participant has a complete ballot', async () => {
        const deviceState = await createValidDeviceState();
        const action = await createRevealBallotCloseAction({
            creatorSession: createCreatorSession(),
            deviceState,
            poll: createPoll({
                boardEntries: [
                    createAcceptedBallotEntry({
                        entryId: 'a1',
                        optionIndex: 1,
                        participantIndex: 1,
                    }),
                    createAcceptedBallotEntry({
                        entryId: 'a2',
                        optionIndex: 2,
                        participantIndex: 1,
                    }),
                    createAcceptedBallotEntry({
                        entryId: 'b1',
                        optionIndex: 1,
                        participantIndex: 2,
                    }),
                    createAcceptedBallotEntry({
                        entryId: 'b2',
                        optionIndex: 2,
                        participantIndex: 2,
                    }),
                    createAcceptedBallotEntry({
                        entryId: 'c1',
                        optionIndex: 1,
                        participantIndex: 3,
                    }),
                    createAcceptedBallotEntry({
                        entryId: 'c2',
                        optionIndex: 2,
                        participantIndex: 3,
                    }),
                ],
                ceremony: {
                    acceptedDecryptionShareCount: 0,
                    acceptedEncryptedBallotCount: 6,
                    acceptedRegistrationCount: 3,
                    activeParticipantCount: 3,
                    blockingParticipantIndices: [],
                    completeEncryptedBallotParticipantCount: 3,
                    revealReady: true,
                    restartCount: 0,
                },
                rosterEntries: [
                    {
                        authPublicKey: deviceState.authPublicKey,
                        participantIndex: 1,
                        transportPublicKey: deviceState.transportPublicKey,
                        transportSuite: 'X25519',
                        voterName: deviceState.voterName,
                    },
                    {
                        authPublicKey: 'auth-2',
                        participantIndex: 2,
                        transportPublicKey: 'transport-2',
                        transportSuite: 'X25519',
                        voterName: 'Bob',
                    },
                    {
                        authPublicKey: 'auth-3',
                        participantIndex: 3,
                        transportPublicKey: 'transport-3',
                        transportSuite: 'X25519',
                        voterName: 'Cora',
                    },
                ],
            }),
            voterSession: createVoterSession({
                voterIndex: 1,
                voterToken: deviceState.voterToken,
                voterName: deviceState.voterName,
            }),
        });

        expect(action?.kind).toBe('publish-ballot-close');
        expect(
            action?.signedPayload.payload.messageType === 'ballot-close'
                ? action.signedPayload.payload.includedParticipantIndices
                : null,
        ).toEqual([1, 2, 3]);
    });

    it('uses a stable threshold subset of decryption shares for tally publication', () => {
        expect(
            selectCanonicalDecryptionShares({
                threshold: 2,
                validShares: [
                    {
                        index: 4,
                        value: 'share-4' as never,
                    },
                    {
                        index: 2,
                        value: 'share-2' as never,
                    },
                    {
                        index: 3,
                        value: 'share-3' as never,
                    },
                ],
            }),
        ).toEqual([
            {
                index: 2,
                value: 'share-2',
            },
            {
                index: 3,
                value: 'share-3',
            },
        ]);
    });

    it('waits for the threshold share count before publishing a tally', () => {
        expect(
            selectCanonicalDecryptionShares({
                threshold: 3,
                validShares: [
                    {
                        index: 1,
                        value: 'share-1' as never,
                    },
                    {
                        index: 2,
                        value: 'share-2' as never,
                    },
                ],
            }),
        ).toBeNull();
    });

    it('stops automation for a participant skipped from the active ceremony', async () => {
        await expect(
            resolveAutomaticCeremonyAction({
                creatorSession: null,
                deviceState: createDeviceState(),
                poll: createPoll({
                    voters: [
                        {
                            ceremonyState: 'active',
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                        {
                            ceremonyState: 'skipped',
                            deviceReady: true,
                            voterIndex: 2,
                            voterName: 'Bob',
                        },
                        {
                            ceremonyState: 'active',
                            deviceReady: true,
                            voterIndex: 3,
                            voterName: 'Cora',
                        },
                    ],
                    rosterEntries: [
                        {
                            authPublicKey: 'auth-1',
                            participantIndex: 1,
                            transportPublicKey: 'transport-1',
                            transportSuite: 'X25519',
                            voterName: 'Alice',
                        },
                        {
                            authPublicKey: 'auth-3',
                            participantIndex: 2,
                            transportPublicKey: 'transport-3',
                            transportSuite: 'X25519',
                            voterName: 'Cora',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).resolves.toBeNull();
    });

    it('uses the dense active-session participant index after a ceremony restart', async () => {
        const deviceState = await createValidDeviceState({
            isCreatorParticipant: false,
            voterIndex: 4,
            voterName: 'Dora',
            voterToken: 'token-4',
        });
        const action = await resolveAutomaticCeremonyAction({
            creatorSession: null,
            deviceState,
            poll: createPoll({
                submittedParticipantCount: 4,
                voters: [
                    {
                        ceremonyState: 'active',
                        deviceReady: true,
                        voterIndex: 1,
                        voterName: 'Alice',
                    },
                    {
                        ceremonyState: 'active',
                        deviceReady: true,
                        voterIndex: 2,
                        voterName: 'Bob',
                    },
                    {
                        ceremonyState: 'skipped',
                        deviceReady: true,
                        voterIndex: 3,
                        voterName: 'Cora',
                    },
                    {
                        ceremonyState: 'active',
                        deviceReady: true,
                        voterIndex: 4,
                        voterName: 'Dora',
                    },
                ],
                ceremony: {
                    acceptedDecryptionShareCount: 0,
                    acceptedEncryptedBallotCount: 0,
                    acceptedRegistrationCount: 0,
                    activeParticipantCount: 3,
                    blockingParticipantIndices: [],
                    completeEncryptedBallotParticipantCount: 0,
                    revealReady: false,
                    restartCount: 1,
                },
                rosterEntries: [
                    {
                        authPublicKey: 'auth-1',
                        participantIndex: 1,
                        transportPublicKey: 'transport-1',
                        transportSuite: 'X25519',
                        voterName: 'Alice',
                    },
                    {
                        authPublicKey: 'auth-2',
                        participantIndex: 2,
                        transportPublicKey: 'transport-2',
                        transportSuite: 'X25519',
                        voterName: 'Bob',
                    },
                    {
                        authPublicKey: deviceState.authPublicKey,
                        participantIndex: 3,
                        transportPublicKey: deviceState.transportPublicKey,
                        transportSuite: 'X25519',
                        voterName: 'Dora',
                    },
                ],
            }),
            voterSession: createVoterSession({
                voterIndex: 4,
                voterName: 'Dora',
                voterToken: 'token-4',
            }),
        });

        expect(action?.kind).toBe('publish-registration');
        expect(action?.signedPayload.payload.participantIndex).toBe(3);
    });
});
