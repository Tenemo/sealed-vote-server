import type { PollResponse } from '@sealed-vote/contracts';

import { derivePollWorkflow } from './pollWorkflow';

import type { StoredPollDeviceState } from 'features/Polls/pollDeviceStorage';
import type { StoredVoterSession } from 'features/Polls/pollSessionStorage';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse => ({
    id: 'poll-1',
    slug: 'best-fruit--1111',
    pollName: 'Best fruit',
    createdAt: '2026-04-11T10:00:00.000Z',
    isOpen: true,
    choices: ['Apples', 'Bananas'],
    voters: [],
    manifest: null,
    manifestHash: null,
    sessionId: null,
    sessionFingerprint: null,
    phase: 'open',
    submittedParticipantCount: 0,
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
    rosterEntries: [],
    thresholds: {
        reconstructionThreshold: null,
        minimumPublishedVoterCount: null,
        maxParticipants: 51,
        validationTarget: 15,
    },
    ...overrides,
});

const createDeviceState = (
    overrides: Partial<StoredPollDeviceState> = {},
): StoredPollDeviceState => ({
    authPrivateKeyPkcs8: '1'.repeat(64),
    authPublicKey: 'auth-1',
    dkgBlindingSeed: '2'.repeat(64),
    dkgSecretSeed: '3'.repeat(64),
    isCreatorParticipant: false,
    pendingPayloads: {},
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    storedBallotScores: [8, 6],
    transportPrivateKeyPkcs8: '4'.repeat(64),
    transportPublicKey: 'transport-1',
    transportSuite: 'X25519',
    voterIndex: 1,
    voterName: 'Alice',
    voterToken: 'token-1',
    ...overrides,
});

const createVoterSession = (
    overrides: Partial<StoredVoterSession> = {},
): StoredVoterSession => ({
    pollId: 'poll-1',
    pollSlug: 'best-fruit--1111',
    voterIndex: 1,
    voterName: 'Alice',
    voterToken: 'token-1',
    ...overrides,
});

describe('pollWorkflow', () => {
    it('shows the vote form to anonymous visitors while the vote is open', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll(),
                voterSession: null,
            }),
        ).toMatchObject({
            canSubmitVote: true,
            currentStep: 'anonymous-ready-to-vote',
        });
    });

    it('requires the creator to submit locally before close becomes available', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: 'poll-1',
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    submittedParticipantCount: 2,
                }),
                voterSession: null,
            }),
        ).toMatchObject({
            canCloseVoting: false,
            currentStep: 'creator-must-submit-first',
            isCreator: true,
        });
    });

    it('enables close only for the creator participant once at least three votes are submitted', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: 'poll-1',
                deviceState: createDeviceState({
                    isCreatorParticipant: true,
                }),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    submittedParticipantCount: 3,
                    voters: [
                        {
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canCloseVoting: true,
            currentStep: 'creator-can-close',
        });
    });

    it('moves to securing-auto when post-close background work is available', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: true,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'securing',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'securing-auto',
        });
    });

    it('stays in securing-waiting when no automatic ceremony action is available', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'securing',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: false,
            currentStep: 'securing-waiting',
        });
    });

    it('surfaces automation retries while securing after a background failure', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: true,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'securing',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: true,
            currentStep: 'automation-retry-required',
        });
    });

    it('flags missing local state after close when the participant session exists', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'securing',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'local-vote-missing',
            missingLocalState: true,
        });
    });

    it('switches to automatic reveal once the counted ballot set is ready', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: 'poll-1',
                deviceState: createDeviceState({
                    isCreatorParticipant: true,
                }),
                hasAutomaticCeremonyAction: true,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'ready-to-reveal',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                    ceremony: {
                        acceptedDecryptionShareCount: 0,
                        acceptedEncryptedBallotCount: 6,
                        acceptedRegistrationCount: 3,
                        completeEncryptedBallotParticipantCount: 3,
                        revealReady: true,
                    },
                    thresholds: {
                        reconstructionThreshold: 2,
                        minimumPublishedVoterCount: 2,
                        maxParticipants: 51,
                        validationTarget: 15,
                    },
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: false,
            currentStep: 'revealing-auto',
        });
    });

    it('waits for results when ready-to-reveal has no local automation work', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    manifest: {
                        optionList: ['Apples', 'Bananas'],
                        rosterHash: 'a'.repeat(64),
                    },
                    manifestHash: 'b'.repeat(64),
                    phase: 'ready-to-reveal',
                    sessionId: 'c'.repeat(64),
                    submittedParticipantCount: 3,
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: false,
            currentStep: 'waiting-for-results',
        });
    });

    it('shows the complete state even when a stale session no longer has local device state', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    phase: 'complete',
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'complete',
            missingLocalState: false,
        });
    });

    it('shows the aborted state even when a stale session no longer has local device state', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    phase: 'aborted',
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'aborted',
            missingLocalState: false,
        });
    });
});
