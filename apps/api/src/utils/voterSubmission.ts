import createError from 'http-errors';

import type { Database } from '../db/client.js';

import { findVoterByTokenReadOnly } from './voterAuth.js';

type ExistingSubmissionResolutionOptions<
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse,
> = {
    existingSubmission: TExistingSubmission | undefined;
    incomingValue: TIncomingValue;
    isEquivalent: (
        existingSubmission: TExistingSubmission,
        incomingValue: TIncomingValue,
    ) => boolean;
    conflictMessage: string;
    successResponse: TSuccessResponse;
};

type DuplicateSubmissionRecoveryOptions<
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse,
> = {
    db: Database;
    pollId: string;
    voterToken: string;
    incomingValue: TIncomingValue;
    loadExistingSubmission: (args: {
        db: Database;
        pollId: string;
        voterId: string;
    }) => Promise<TExistingSubmission | undefined>;
    isEquivalent: (
        existingSubmission: TExistingSubmission,
        incomingValue: TIncomingValue,
    ) => boolean;
    conflictMessage: string;
    missingSubmissionConflictMessage?: string;
    successResponse: TSuccessResponse;
};

export const resolveExistingVoterSubmission = <
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse,
>({
    existingSubmission,
    incomingValue,
    isEquivalent,
    conflictMessage,
    successResponse,
}: ExistingSubmissionResolutionOptions<
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse
>): TSuccessResponse | null => {
    if (!existingSubmission) {
        return null;
    }

    if (!isEquivalent(existingSubmission, incomingValue)) {
        throw createError(409, conflictMessage);
    }

    return successResponse;
};

export const recoverDuplicateVoterSubmission = async <
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse,
>({
    db,
    pollId,
    voterToken,
    incomingValue,
    loadExistingSubmission,
    isEquivalent,
    conflictMessage,
    missingSubmissionConflictMessage,
    successResponse,
}: DuplicateSubmissionRecoveryOptions<
    TExistingSubmission,
    TIncomingValue,
    TSuccessResponse
>): Promise<TSuccessResponse> => {
    const voter = await findVoterByTokenReadOnly(db, pollId, voterToken);

    if (!voter) {
        throw createError(
            409,
            missingSubmissionConflictMessage ?? conflictMessage,
        );
    }

    const existingSubmission = await loadExistingSubmission({
        db,
        pollId,
        voterId: voter.id,
    });
    const resolvedSubmission = resolveExistingVoterSubmission({
        existingSubmission,
        incomingValue,
        isEquivalent,
        conflictMessage,
        successResponse,
    });

    if (resolvedSubmission) {
        return resolvedSubmission;
    }

    throw createError(409, missingSubmissionConflictMessage ?? conflictMessage);
};
