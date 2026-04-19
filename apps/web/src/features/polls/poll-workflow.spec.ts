import { fixedScoreRange, type PollResponse } from '@sealed-vote/contracts';

import { derivePollWorkflow } from './poll-workflow';

import type { StoredPollDeviceState } from 'features/polls/poll-device-storage';
import type { StoredVoterSession } from 'features/polls/poll-session-storage';

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
    submittedVoterCount: 0,
    minimumCloseVoterCount: 3,
    ceremony: {
        acceptedDecryptionShareCount: 0,
        acceptedEncryptedBallotCount: 0,
        acceptedRegistrationCount: 0,
        activeParticipantCount: 0,
        blockingVoterIndices: [],
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
    rosterEntries: [],
    thresholds: {
        reconstructionThreshold: null,
        minimumPublishedVoterCount: null,
        maximumVoterCount: 51,
        validationTarget: 15,
    },
    ...overrides,
});

const createClosedPoll = (
    overrides: Partial<PollResponse> = {},
): PollResponse =>
    createPoll({
        isOpen: false,
        manifest: {
            optionList: ['Apples', 'Bananas'],
            rosterHash: 'a'.repeat(64),
            scoreRange: fixedScoreRange,
        },
        manifestHash: 'b'.repeat(64),
        phase: 'securing',
        sessionId: 'c'.repeat(64),
        submittedVoterCount: 3,
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

    it('shows the submitting state while voter registration is in flight', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: true,
                poll: createPoll(),
                voterSession: null,
            }),
        ).toMatchObject({
            canSubmitVote: false,
            currentStep: 'submitting-vote',
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
                    submittedVoterCount: 2,
                }),
                voterSession: null,
            }),
        ).toMatchObject({
            canCloseVoting: false,
            currentStep: 'creator-must-submit-first',
            isCreator: true,
        });
    });

    it.each([
        {
            creatorSessionPollId: null,
            testName:
                'blocks anonymous re-registration when a stale voter session has lost its device state',
        },
        {
            creatorSessionPollId: 'poll-1',
            testName:
                'blocks the creator from re-entering the open flow when their voter device state is missing',
        },
    ])('$testName', ({ creatorSessionPollId }) => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId,
                deviceState: null,
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll(),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canSubmitVote: false,
            currentStep: 'local-vote-missing',
            hasLocalVote: false,
            missingLocalState: true,
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
                    submittedVoterCount: 3,
                    voters: [
                        {
                            ceremonyState: 'active',
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

    it('flags a participant whose local ballot scores are no longer recoverable', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState({
                    storedBallotScores: [8],
                }),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    voters: [
                        {
                            ceremonyState: 'active',
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'local-vote-missing',
            hasLocalVote: false,
            hasSubmittedVote: true,
            missingLocalState: true,
        });
    });

    it('does not allow the creator to close while their local ballot scores are missing', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: 'poll-1',
                deviceState: createDeviceState({
                    isCreatorParticipant: true,
                    storedBallotScores: null,
                }),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    submittedVoterCount: 3,
                    voters: [
                        {
                            ceremonyState: 'active',
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canCloseVoting: false,
            currentStep: 'local-vote-missing',
            hasLocalVote: false,
            hasSubmittedVote: true,
            missingLocalState: true,
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
                poll: createClosedPoll(),
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
                poll: createClosedPoll(),
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
                poll: createClosedPoll(),
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
                poll: createClosedPoll(),
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
                    ...createClosedPoll(),
                    phase: 'ready-to-reveal',
                    ceremony: {
                        acceptedDecryptionShareCount: 0,
                        acceptedEncryptedBallotCount: 6,
                        acceptedRegistrationCount: 3,
                        activeParticipantCount: 3,
                        blockingVoterIndices: [],
                        completeEncryptedBallotParticipantCount: 3,
                        revealReady: true,
                        restartCount: 0,
                    },
                    thresholds: {
                        reconstructionThreshold: 2,
                        minimumPublishedVoterCount: 2,
                        maximumVoterCount: 51,
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
                poll: createClosedPoll({
                    phase: 'ready-to-reveal',
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: false,
            currentStep: 'waiting-for-results',
        });
    });

    it.each([
        {
            canRetryAutomation: true,
            currentStep: 'automation-retry-required',
            hasAutomaticCeremonyAction: false,
            hasAutomationFailure: true,
            phase: 'ready-to-reveal' as const,
            testName:
                'requires a retry when automation fails before reveal begins',
        },
        {
            canRetryAutomation: false,
            currentStep: 'revealing-auto',
            hasAutomaticCeremonyAction: true,
            hasAutomationFailure: false,
            phase: 'revealing' as const,
            testName:
                'keeps automatic reveal work moving once the reveal is underway',
        },
        {
            canRetryAutomation: false,
            currentStep: 'revealing-waiting',
            hasAutomaticCeremonyAction: false,
            hasAutomationFailure: false,
            phase: 'revealing' as const,
            testName:
                'waits during reveal when there is no automatic work to publish',
        },
        {
            canRetryAutomation: true,
            currentStep: 'automation-retry-required',
            hasAutomaticCeremonyAction: false,
            hasAutomationFailure: true,
            phase: 'revealing' as const,
            testName: 'surfaces reveal automation failures for retry',
        },
    ])(
        '$testName',
        ({
            canRetryAutomation,
            currentStep,
            hasAutomaticCeremonyAction,
            hasAutomationFailure,
            phase,
        }) => {
            expect(
                derivePollWorkflow({
                    creatorSessionPollId: null,
                    deviceState: createDeviceState(),
                    hasAutomaticCeremonyAction,
                    hasAutomationFailure,
                    isSubmittingVote: false,
                    poll: createClosedPoll({
                        phase,
                    }),
                    voterSession: createVoterSession(),
                }),
            ).toMatchObject({
                canRetryAutomation,
                currentStep,
            });
        },
    );

    it('shows skipped when the creator restarts the ceremony without this voter', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createClosedPoll({
                    submittedVoterCount: 4,
                    voters: [
                        {
                            ceremonyState: 'skipped',
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            canRetryAutomation: false,
            currentStep: 'skipped',
            missingLocalState: false,
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

    it('keeps showing skipped after the ceremony completes for that device', () => {
        expect(
            derivePollWorkflow({
                creatorSessionPollId: null,
                deviceState: createDeviceState(),
                hasAutomaticCeremonyAction: false,
                hasAutomationFailure: false,
                isSubmittingVote: false,
                poll: createPoll({
                    isOpen: false,
                    phase: 'complete',
                    voters: [
                        {
                            ceremonyState: 'skipped',
                            deviceReady: true,
                            voterIndex: 1,
                            voterName: 'Alice',
                        },
                    ],
                }),
                voterSession: createVoterSession(),
            }),
        ).toMatchObject({
            currentStep: 'skipped',
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
