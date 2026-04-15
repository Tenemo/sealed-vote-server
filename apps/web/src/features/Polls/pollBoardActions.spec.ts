import type { PollResponse } from '@sealed-vote/contracts';

import {
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
} from './pollBoardActions';

import {
    createPendingPollDeviceState,
    createPollDeviceState,
    type StoredPollDeviceState,
} from 'features/Polls/pollDeviceStorage';
import type { StoredVoterSession } from 'features/Polls/pollSessionStorage';

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

    it('stops automation when the active roster entry no longer matches the device transport suite', async () => {
        await expect(
            resolveAutomaticCeremonyAction({
                creatorSession: null,
                deviceState: createDeviceState(),
                poll: createPoll({
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
                            transportSuite: 'P-256' as never,
                            voterName: 'Bob',
                        },
                        {
                            authPublicKey: 'auth-3',
                            participantIndex: 3,
                            transportPublicKey: 'transport-3',
                            transportSuite: 'X25519',
                            voterName: 'Cora',
                        },
                    ] as PollResponse['rosterEntries'],
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
