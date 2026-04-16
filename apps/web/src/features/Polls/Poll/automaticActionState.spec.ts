import { fixedScoreRange, type PollResponse } from '@sealed-vote/contracts';

import {
    getLocalCeremonyState,
    isPreparedAutomaticActionCurrent,
} from './automaticActionState';

import type { PreparedCeremonyAction } from '../pollBoardActions';
import type { StoredPollDeviceState } from '../pollDeviceStorage';
import type { StoredVoterSession } from '../pollSessionStorage';

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
            voterIndex: 4,
            voterName: 'Dora',
        },
    ],
    manifest: {
        optionList: ['Apples', 'Bananas'],
        rosterHash: 'a'.repeat(64),
        scoreRange: fixedScoreRange,
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
        restartCount: 1,
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
            authPublicKey: 'auth-4',
            participantIndex: 3,
            transportPublicKey: 'transport-4',
            transportSuite: 'X25519',
            voterName: 'Dora',
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
    authPublicKey: 'auth-4',
    dkgBlindingSeed: '2'.repeat(64),
    dkgSecretSeed: '3'.repeat(64),
    isCreatorParticipant: false,
    pendingPayloads: {},
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    storedBallotScores: [8, 6],
    transportPrivateKeyPkcs8: '4'.repeat(64),
    transportPublicKey: 'transport-4',
    transportSuite: 'X25519',
    voterIndex: 4,
    voterName: 'Dora',
    voterToken: 'token-4',
    ...overrides,
});

const createVoterSession = (
    overrides: Partial<StoredVoterSession> = {},
): StoredVoterSession => ({
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    voterIndex: 4,
    voterName: 'Dora',
    voterToken: 'token-4',
    ...overrides,
});

const createAction = (
    overrides: Partial<
        Extract<
            PreparedCeremonyAction['signedPayload']['payload'],
            { messageType: 'registration' }
        >
    > = {},
): PreparedCeremonyAction => ({
    kind: 'publish-registration',
    slotKey: 'slot-1',
    signedPayload: {
        payload: {
            authPublicKey: 'auth-4' as never,
            manifestHash: 'b'.repeat(64),
            messageType: 'registration',
            participantIndex: 3,
            phase: 0,
            protocolVersion: 'v1',
            rosterHash: 'a'.repeat(64),
            sessionId: 'c'.repeat(64),
            transportPublicKey: 'transport-4' as never,
            ...overrides,
        } as Extract<
            PreparedCeremonyAction['signedPayload']['payload'],
            { messageType: 'registration' }
        >,
        signature: 'd'.repeat(128),
    },
});

describe('automaticActionState', () => {
    it('accepts an action that still matches the live session and local roster slot', () => {
        expect(
            isPreparedAutomaticActionCurrent({
                action: createAction(),
                deviceState: createDeviceState(),
                poll: createPoll(),
                voterSession: createVoterSession(),
            }),
        ).toBe(true);
    });

    it('rejects an action from an older ceremony session', () => {
        expect(
            isPreparedAutomaticActionCurrent({
                action: createAction({
                    sessionId: 'd'.repeat(64),
                }),
                deviceState: createDeviceState(),
                poll: createPoll(),
                voterSession: createVoterSession(),
            }),
        ).toBe(false);
    });

    it('rejects an action that still uses the pre-restart participant index', () => {
        expect(
            isPreparedAutomaticActionCurrent({
                action: createAction({
                    participantIndex: 4,
                }),
                deviceState: createDeviceState(),
                poll: createPoll(),
                voterSession: createVoterSession(),
            }),
        ).toBe(false);
    });

    it('rejects an action once the device is no longer in the active roster', () => {
        expect(
            isPreparedAutomaticActionCurrent({
                action: createAction(),
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
                            transportSuite: 'X25519',
                            voterName: 'Bob',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toBe(false);
    });

    it('rejects an action when the device transport suite no longer matches the active roster entry', () => {
        expect(
            isPreparedAutomaticActionCurrent({
                action: createAction(),
                deviceState: createDeviceState(),
                poll: createPoll({
                    rosterEntries: [
                        {
                            authPublicKey: 'auth-4',
                            participantIndex: 3,
                            transportPublicKey: 'transport-4',
                            transportSuite: 'P-256' as never,
                            voterName: 'Dora',
                        },
                    ] as PollResponse['rosterEntries'],
                }),
                voterSession: createVoterSession(),
            }),
        ).toBe(false);
    });

    it('reads the local ceremony state from the current poll roster', () => {
        expect(
            getLocalCeremonyState({
                poll: createPoll({
                    voters: [
                        {
                            ceremonyState: 'skipped',
                            deviceReady: true,
                            voterIndex: 4,
                            voterName: 'Dora',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toBe('skipped');
    });
});
