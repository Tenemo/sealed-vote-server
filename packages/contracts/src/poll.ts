import type { ElectionManifest } from 'threshold-elgamal';

import type { BoardMessageRecord } from './vote.js';

export type CreatePollRequest = {
    choices: string[];
    creatorToken: string;
    pollName: string;
    protocolVersion?: string;
};

export type CreatePollResponse = {
    id: string;
    slug: string;
    creatorToken: string;
};

export type PollRosterParticipant = {
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
    blockingParticipantIndices: number[];
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
    voters: PollRosterParticipant[];
    manifest: ElectionManifest | null;
    manifestHash: string | null;
    sessionId: string | null;
    sessionFingerprint: string | null;
    phase: PollPhase;
    submittedParticipantCount: number;
    minimumCloseParticipantCount: number;
    ceremony: PollCeremonySummary;
    boardAudit: PollBoardAudit;
    verification: PollVerificationSummary;
    boardEntries: BoardMessageRecord[];
    rosterEntries: PollRosterEntry[];
    thresholds: {
        reconstructionThreshold: number | null;
        minimumPublishedVoterCount: number | null;
        maxParticipants: number;
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

export type RecoverSessionRequest =
    | {
          creatorToken: string;
          voterToken?: never;
      }
    | {
          creatorToken?: never;
          voterToken: string;
      };

export type RecoverSessionResponse = {
    role: 'creator' | 'voter';
    pollId: string;
    pollSlug: string;
    phase: PollPhase;
    isOpen: boolean;
    voterName: string | null;
    voterIndex: number | null;
};
