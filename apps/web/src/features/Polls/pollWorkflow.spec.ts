import type { PollResponse } from '@sealed-vote/contracts';
import type { EncodedPoint } from 'threshold-elgamal/core';

import { derivePollWorkflow } from './pollWorkflow';

import type { StoredPollDeviceState } from './pollDeviceStorage';
import type { StoredVoterSession } from './voterSessionStorage';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse =>
    ({
        id: 'poll-1',
        slug: 'best-fruit--1111',
        pollName: 'Best fruit',
        createdAt: '2026-04-10T00:00:00.000Z',
        isOpen: true,
        choices: ['Apples', 'Bananas'],
        voters: [],
        manifest: null,
        manifestHash: null,
        sessionId: null,
        sessionFingerprint: null,
        phase: 'open',
        joinedParticipantCount: 0,
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
        rosterEntries: [],
        thresholds: {
            reconstructionThreshold: null,
            minimumPublishedVoterCount: null,
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
    voterToken: 'token-1',
    ...overrides,
});

const createDeviceState = (
    overrides: Partial<StoredPollDeviceState> = {},
): StoredPollDeviceState => ({
    authPrivateKeyPkcs8: 'a'.repeat(64),
    authPublicKey: 'b'.repeat(64),
    dkgBlindingSeed: 'c'.repeat(64),
    dkgSecretSeed: 'd'.repeat(64),
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    transportPrivateKeyPkcs8: 'e'.repeat(64),
    transportPublicKey: 'f'.repeat(64),
    transportSuite: 'X25519',
    voterIndex: 2,
    voterName: 'Bob',
    voterToken: 'token-1',
    ...overrides,
});

describe('pollWorkflow', () => {
    it('keeps anonymous viewers in the waiting room during the open phase', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                poll: createPoll(),
                voterSession: null,
            }),
        ).toMatchObject({
            canAct: false,
            currentStep: 'anonymous-waiting-to-join',
            isCreator: false,
            missingLocalState: false,
        });
    });

    it('marks joined voters as waiting for the creator while the poll is still open', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                poll: createPoll(),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canAct: false,
            currentStep: 'joined-and-waiting-for-start',
            missingLocalState: false,
        });
    });

    it('requires local device state for preparing, voting, and opening results', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                poll: createPoll({
                    isOpen: false,
                    phase: 'preparing',
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canAct: false,
            currentStep: 'preparing-device',
            missingLocalState: true,
        });
    });

    it('tracks submitted ballots and decryption shares from accepted board entries', () => {
        const voterSession = createVoterSession();

        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                poll: createPoll({
                    isOpen: false,
                    phase: 'voting',
                    boardEntries: [
                        {
                            id: 'entry-1',
                            createdAt: '2026-04-10T00:00:00.000Z',
                            phase: 4,
                            participantIndex: voterSession.voterIndex,
                            messageType: 'ballot-submission',
                            slotKey: 'slot-1',
                            unsignedHash: '1'.repeat(64),
                            previousEntryHash: null,
                            entryHash: '2'.repeat(64),
                            classification: 'accepted',
                            signedPayload: {
                                payload: {
                                    sessionId: '3'.repeat(64),
                                    manifestHash: '4'.repeat(64),
                                    phase: 4,
                                    participantIndex: voterSession.voterIndex,
                                    messageType: 'ballot-submission',
                                    optionIndex: 1,
                                    ciphertext: {
                                        c1: '5'.repeat(64),
                                        c2: '6'.repeat(64),
                                    },
                                    proof: {
                                        branches: [],
                                    },
                                },
                                signature: '7'.repeat(128),
                            },
                        },
                    ],
                }),
                voterSession,
            }),
        ).toMatchObject({
            canAct: false,
            currentStep: 'vote-submitted-and-waiting',
            hasSubmittedBallot: true,
        });

        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                poll: createPoll({
                    isOpen: false,
                    phase: 'opening-results',
                    boardEntries: [
                        {
                            id: 'entry-2',
                            createdAt: '2026-04-10T00:00:00.000Z',
                            phase: 5,
                            participantIndex: voterSession.voterIndex,
                            messageType: 'decryption-share',
                            slotKey: 'slot-2',
                            unsignedHash: '8'.repeat(64),
                            previousEntryHash: null,
                            entryHash: '9'.repeat(64),
                            classification: 'accepted',
                            signedPayload: {
                                payload: {
                                    sessionId: '3'.repeat(64),
                                    manifestHash: '4'.repeat(64),
                                    phase: 5,
                                    participantIndex: voterSession.voterIndex,
                                    messageType: 'decryption-share',
                                    optionIndex: 1,
                                    transcriptHash: 'a'.repeat(64),
                                    ballotCount: 3,
                                    decryptionShare: 'b'.repeat(
                                        64,
                                    ) as EncodedPoint,
                                    proof: {
                                        challenge: 'c'.repeat(64),
                                        response: 'd'.repeat(64),
                                    },
                                },
                                signature: 'e'.repeat(128),
                            },
                        },
                    ],
                }),
                voterSession,
            }),
        ).toMatchObject({
            canAct: false,
            currentStep: 'waiting-for-results',
            hasSubmittedDecryptionShare: true,
        });
    });
});
