import type { ElectionManifest, ScoreRange } from 'threshold-elgamal';

import type { BoardMessageRecord } from './vote.js';

export const fixedScoreRange = {
    min: 1,
    max: 10,
} as const satisfies ScoreRange;

export const minimumPollVotersToClose = 3;
export const maximumPollVoterCount = 51;

export type CreatePollRequest = {
    choices: string[];
    creatorToken: string;
    pollName: string;
    protocolVersion?: 'v1';
};

export type CreatePollResponse = {
    id: string;
    slug: string;
    creatorToken: string;
};

export type PollRosterVoter = {
    ceremonyState: 'active' | 'blocking' | 'skipped';
    deviceReady: boolean;
    voterIndex: number;
    voterName: string;
};

export type PollRosterEntry = {
    authPublicKey: string;
    participantIndex: number;
    transportPublicKey: string;
    transportSuite: 'X25519';
    voterName: string;
};

export type PollBoardAudit = {
    acceptedCount: number;
    duplicateCount: number;
    equivocationCount: number;
    ceremonyDigest: string | null;
    phaseDigests: {
        phase: number;
        digest: string;
    }[];
};

export type PollVerificationSummary = {
    status: 'not-ready' | 'verified' | 'invalid';
    reason: string | null;
    qualParticipantIndices: number[];
    verifiedOptionTallies: {
        optionIndex: number;
        tally: string;
        mean: number;
        acceptedBallotCount: number;
    }[];
};

export const orderVerifiedOptionTallies = (
    tallies: readonly PollVerificationSummary['verifiedOptionTallies'][number][],
): PollVerificationSummary['verifiedOptionTallies'] =>
    [...tallies].sort((left, right) => {
        if (right.mean !== left.mean) {
            return right.mean - left.mean;
        }

        return left.optionIndex - right.optionIndex;
    });

export type PollPhase =
    | 'open'
    | 'securing'
    | 'ready-to-reveal'
    | 'revealing'
    | 'complete'
    | 'aborted';

export type PollCeremonySummary = {
    acceptedDecryptionShareCount: number;
    acceptedEncryptedBallotCount: number;
    acceptedRegistrationCount: number;
    activeParticipantCount: number;
    blockingVoterIndices: number[];
    completeEncryptedBallotParticipantCount: number;
    revealReady: boolean;
    restartCount: number;
};

export type PollResponse = {
    id: string;
    slug: string;
    pollName: string;
    createdAt: string;
    isOpen: boolean;
    choices: string[];
    voters: PollRosterVoter[];
    manifest: ElectionManifest | null;
    manifestHash: string | null;
    sessionId: string | null;
    sessionFingerprint: string | null;
    phase: PollPhase;
    submittedVoterCount: number;
    minimumCloseVoterCount: number;
    ceremony: PollCeremonySummary;
    boardAudit: PollBoardAudit;
    verification: PollVerificationSummary;
    boardEntries: BoardMessageRecord[];
    rosterEntries: PollRosterEntry[];
    thresholds: {
        reconstructionThreshold: number | null;
        minimumPublishedVoterCount: number | null;
        maximumVoterCount: number;
        validationTarget: number;
    };
};

export type RegisterVoterRequest = {
    authPublicKey: string;
    creatorToken?: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
    voterName: string;
    voterToken: string;
};

export type RegisterVoterResponse = {
    message: string;
    voterIndex: number;
    voterName: string;
    pollId: string;
    voterToken: string;
};

export type CloseVotingRequest = {
    creatorToken: string;
};

export type RestartCeremonyRequest = {
    creatorToken: string;
};
