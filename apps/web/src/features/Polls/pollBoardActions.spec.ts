import type { PollResponse } from '@sealed-vote/contracts';

import {
    createRevealBallotCloseAction,
    describeAutomaticCeremonyAction,
    resolveAutomaticCeremonyAction,
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
        completeEncryptedBallotParticipantCount: 0,
        revealReady: false,
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
                        completeEncryptedBallotParticipantCount: 1,
                        revealReady: false,
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
                    completeEncryptedBallotParticipantCount: 3,
                    revealReady: true,
                },
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
});
