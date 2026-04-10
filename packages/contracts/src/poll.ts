import type { ElectionManifest } from 'threshold-elgamal/protocol';

import type { BoardMessageRecord } from './vote.js';

export type CreatePollRequest = {
    choices: string[];
    creatorToken: string;
    pollName: string;
    reconstructionThreshold?: number;
    minimumPublishedVoterCount?: number;
    protocolVersion?: string;
};

export type CreatePollResponse = {
    id: string;
    slug: string;
    creatorToken: string;
};

export type PollRosterParticipant = {
    voterIndex: number;
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
    | 'registration'
    | 'setup'
    | 'ballot'
    | 'decryption'
    | 'complete'
    | 'aborted';

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
    boardAudit: PollBoardAudit;
    verification: PollVerificationSummary;
    boardEntries: BoardMessageRecord[];
    thresholds: {
        reconstructionThreshold: number | null;
        minimumPublishedVoterCount: number | null;
        suggestedReconstructionThreshold: number;
        maxParticipants: number;
        validationTarget: number;
    };
};

export type RegisterVoterRequest = {
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

export type ClosePollRequest = {
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
