import type { PollResponse } from '@sealed-vote/contracts';
import type {
    EncodedAuthPublicKey,
    EncodedTransportPublicKey,
} from 'threshold-elgamal';

import {
    describeAutoBoardSetupAction,
    resolveAutoBoardSetupAction,
} from './pollBoardActions';

import type { StoredPollDeviceState } from './pollDeviceStorage';
import type { StoredVoterSession } from './voterSessionStorage';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse =>
    ({
        id: 'poll-1',
        slug: 'best-fruit--1111',
        pollName: 'Best fruit',
        createdAt: '2026-04-10T00:00:00.000Z',
        isOpen: false,
        choices: ['Apples', 'Bananas'],
        voters: [
            {
                deviceReady: true,
                voterIndex: 1,
                voterName: 'Alice',
            },
            {
                deviceReady: true,
                voterIndex: 2,
                voterName: 'Bob',
            },
            {
                deviceReady: true,
                voterIndex: 3,
                voterName: 'Cora',
            },
        ],
        manifest: {
            protocolVersion: 'v1',
            reconstructionThreshold: 2,
            participantCount: 3,
            minimumPublishedVoterCount: 3,
            ballotCompletenessPolicy: 'ALL_OPTIONS_REQUIRED',
            ballotFinality: 'first-valid',
            scoreDomain: '1..10',
            rosterHash: 'a'.repeat(64),
            optionList: ['Apples', 'Bananas'],
            epochDeadlines: ['2026-04-10T00:00:00.000Z'],
        },
        manifestHash: 'b'.repeat(64),
        sessionId: 'c'.repeat(64),
        sessionFingerprint: 'ABCD-EF12-3456-7890-ABCD-EF12-3456-7890',
        phase: 'preparing',
        joinedParticipantCount: 3,
        minimumStartParticipantCount: 3,
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
                authPublicKey: 'auth-1' as EncodedAuthPublicKey,
                participantIndex: 1,
                transportPublicKey: 'transport-1' as EncodedTransportPublicKey,
                transportSuite: 'X25519',
                voterName: 'Alice',
            },
            {
                authPublicKey: 'auth-2' as EncodedAuthPublicKey,
                participantIndex: 2,
                transportPublicKey: 'transport-2' as EncodedTransportPublicKey,
                transportSuite: 'X25519',
                voterName: 'Bob',
            },
            {
                authPublicKey: 'auth-3' as EncodedAuthPublicKey,
                participantIndex: 3,
                transportPublicKey: 'transport-3' as EncodedTransportPublicKey,
                transportSuite: 'X25519',
                voterName: 'Cora',
            },
        ],
        thresholds: {
            reconstructionThreshold: 2,
            minimumPublishedVoterCount: 3,
            suggestedReconstructionThreshold: 2,
            strictMajorityFloor: 2,
            maxParticipants: 51,
            validationTarget: 15,
        },
        ...overrides,
    }) satisfies PollResponse;

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

const createDeviceState = (
    overrides: Partial<StoredPollDeviceState> = {},
): StoredPollDeviceState => ({
    authPrivateKeyPkcs8: '1'.repeat(64),
    authPublicKey: 'auth-2',
    dkgBlindingSeed: '2'.repeat(64),
    dkgSecretSeed: '3'.repeat(64),
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    transportPrivateKeyPkcs8: '4'.repeat(64),
    transportPublicKey: 'transport-2',
    transportSuite: 'X25519',
    voterIndex: 2,
    voterName: 'Bob',
    voterToken: 'token-2',
    ...overrides,
});

describe('pollBoardActions', () => {
    it('does not schedule hidden board setup work while the vote is still open', () => {
        expect(
            resolveAutoBoardSetupAction({
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
        ).toBeNull();
    });

    it('publishes the participant registration first', () => {
        const action = resolveAutoBoardSetupAction({
            deviceState: createDeviceState(),
            poll: createPoll(),
            voterSession: createVoterSession(),
        });

        expect(action?.kind).toBe('publish-registration');
        expect(action?.payload.participantIndex).toBe(2);
        expect(describeAutoBoardSetupAction(action)).toContain(
            'device registration',
        );
    });

    it('publishes the manifest only for the first roster participant once registrations are complete', () => {
        const poll = createPoll({
            boardEntries: [
                {
                    id: 'entry-1',
                    createdAt: '2026-04-10T00:00:00.000Z',
                    phase: 0,
                    participantIndex: 1,
                    messageType: 'registration',
                    slotKey: 'slot-1',
                    unsignedHash: '1'.repeat(64),
                    previousEntryHash: null,
                    entryHash: '2'.repeat(64),
                    classification: 'accepted',
                    signedPayload: {
                        payload: {
                            sessionId: 'c'.repeat(64),
                            manifestHash: 'b'.repeat(64),
                            phase: 0,
                            participantIndex: 1,
                            messageType: 'registration',
                            rosterHash: 'a'.repeat(64),
                            authPublicKey: 'auth-1' as EncodedAuthPublicKey,
                            transportPublicKey:
                                'transport-1' as EncodedTransportPublicKey,
                        },
                        signature: 'f'.repeat(128),
                    },
                },
                {
                    id: 'entry-2',
                    createdAt: '2026-04-10T00:00:00.000Z',
                    phase: 0,
                    participantIndex: 2,
                    messageType: 'registration',
                    slotKey: 'slot-2',
                    unsignedHash: '3'.repeat(64),
                    previousEntryHash: '2'.repeat(64),
                    entryHash: '4'.repeat(64),
                    classification: 'accepted',
                    signedPayload: {
                        payload: {
                            sessionId: 'c'.repeat(64),
                            manifestHash: 'b'.repeat(64),
                            phase: 0,
                            participantIndex: 2,
                            messageType: 'registration',
                            rosterHash: 'a'.repeat(64),
                            authPublicKey: 'auth-2' as EncodedAuthPublicKey,
                            transportPublicKey:
                                'transport-2' as EncodedTransportPublicKey,
                        },
                        signature: 'f'.repeat(128),
                    },
                },
                {
                    id: 'entry-3',
                    createdAt: '2026-04-10T00:00:00.000Z',
                    phase: 0,
                    participantIndex: 3,
                    messageType: 'registration',
                    slotKey: 'slot-3',
                    unsignedHash: '5'.repeat(64),
                    previousEntryHash: '4'.repeat(64),
                    entryHash: '6'.repeat(64),
                    classification: 'accepted',
                    signedPayload: {
                        payload: {
                            sessionId: 'c'.repeat(64),
                            manifestHash: 'b'.repeat(64),
                            phase: 0,
                            participantIndex: 3,
                            messageType: 'registration',
                            rosterHash: 'a'.repeat(64),
                            authPublicKey: 'auth-3' as EncodedAuthPublicKey,
                            transportPublicKey:
                                'transport-3' as EncodedTransportPublicKey,
                        },
                        signature: 'f'.repeat(128),
                    },
                },
            ],
        });

        expect(
            resolveAutoBoardSetupAction({
                deviceState: createDeviceState({
                    authPublicKey: 'auth-1',
                    transportPublicKey: 'transport-1',
                    voterIndex: 1,
                    voterName: 'Alice',
                    voterToken: 'token-1',
                }),
                poll,
                voterSession: createVoterSession({
                    voterIndex: 1,
                    voterName: 'Alice',
                    voterToken: 'token-1',
                }),
            })?.kind,
        ).toBe('publish-manifest');

        expect(
            resolveAutoBoardSetupAction({
                deviceState: createDeviceState(),
                poll,
                voterSession: createVoterSession(),
            }),
        ).toBeNull();
    });

    it('accepts the manifest once it has been published', () => {
        const action = resolveAutoBoardSetupAction({
            deviceState: createDeviceState(),
            poll: createPoll({
                boardEntries: [
                    {
                        id: 'entry-1',
                        createdAt: '2026-04-10T00:00:00.000Z',
                        phase: 0,
                        participantIndex: 2,
                        messageType: 'registration',
                        slotKey: 'slot-2',
                        unsignedHash: '1'.repeat(64),
                        previousEntryHash: null,
                        entryHash: '2'.repeat(64),
                        classification: 'accepted',
                        signedPayload: {
                            payload: {
                                sessionId: 'c'.repeat(64),
                                manifestHash: 'b'.repeat(64),
                                phase: 0,
                                participantIndex: 2,
                                messageType: 'registration',
                                rosterHash: 'a'.repeat(64),
                                authPublicKey: 'auth-2' as EncodedAuthPublicKey,
                                transportPublicKey:
                                    'transport-2' as EncodedTransportPublicKey,
                            },
                            signature: 'f'.repeat(128),
                        },
                    },
                    {
                        id: 'entry-4',
                        createdAt: '2026-04-10T00:00:00.000Z',
                        phase: 0,
                        participantIndex: 1,
                        messageType: 'manifest-publication',
                        slotKey: 'slot-4',
                        unsignedHash: '3'.repeat(64),
                        previousEntryHash: '2'.repeat(64),
                        entryHash: '4'.repeat(64),
                        classification: 'accepted',
                        signedPayload: {
                            payload: {
                                sessionId: 'c'.repeat(64),
                                manifestHash: 'b'.repeat(64),
                                phase: 0,
                                participantIndex: 1,
                                messageType: 'manifest-publication',
                                manifest: createPoll().manifest!,
                            },
                            signature: 'f'.repeat(128),
                        },
                    },
                ],
            }),
            voterSession: createVoterSession(),
        });

        expect(action?.kind).toBe('accept-manifest');
        expect(describeAutoBoardSetupAction(action)).toContain(
            'Confirming the frozen manifest',
        );
    });
});
