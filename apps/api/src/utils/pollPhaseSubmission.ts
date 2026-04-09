import type { FastifyInstance } from 'fastify';
import createError from 'http-errors';

import type { Database, DatabaseTransaction } from '../db/client.js';

import { isConstraintViolation, withTransaction } from './db.js';
import { lockPollById, type LockedPoll } from './pollLocks.js';
import { authenticateVoter, type AuthenticatedVoter } from './voterAuth.js';
import {
    recoverDuplicateVoterSubmission,
    resolveExistingVoterSubmission,
} from './voterSubmission.js';

type SubmissionExecutionContext<TIncomingValue, TExtra> = {
    extra: TExtra;
    incomingValue: TIncomingValue;
    poll: LockedPoll;
    pollId: string;
    tx: DatabaseTransaction;
    voter: AuthenticatedVoter;
};

type VoterPhaseSubmissionOptions<
    TIncomingValue,
    TExistingSubmission,
    TSuccessResponse,
    TExtra = void,
> = {
    conflictMessage: string;
    fastify: FastifyInstance;
    incomingValue: TIncomingValue;
    isEquivalent: (
        existingSubmission: TExistingSubmission,
        incomingValue: TIncomingValue,
    ) => boolean;
    loadExistingSubmission: (args: {
        db: Database | DatabaseTransaction;
        pollId: string;
        shouldLock: boolean;
        voterId: string;
    }) => Promise<TExistingSubmission | undefined>;
    loadExtra?: (args: {
        poll: LockedPoll;
        pollId: string;
        tx: DatabaseTransaction;
    }) => Promise<TExtra>;
    missingSubmissionConflictMessage?: string;
    pollId: string;
    run: (
        context: SubmissionExecutionContext<TIncomingValue, TExtra>,
    ) => Promise<void>;
    successResponse: TSuccessResponse;
    uniqueConstraintName: string;
    validate?: (
        context: SubmissionExecutionContext<TIncomingValue, TExtra>,
    ) => Promise<void> | void;
    voterToken: string;
};

const getNotFoundMessage = (pollId: string): string =>
    `Poll with ID ${pollId} does not exist.`;

export const executeVoterPhaseSubmission = async <
    TIncomingValue,
    TExistingSubmission,
    TSuccessResponse,
    TExtra = void,
>({
    conflictMessage,
    fastify,
    incomingValue,
    isEquivalent,
    loadExistingSubmission,
    loadExtra,
    missingSubmissionConflictMessage,
    pollId,
    run,
    successResponse,
    uniqueConstraintName,
    validate,
    voterToken,
}: VoterPhaseSubmissionOptions<
    TIncomingValue,
    TExistingSubmission,
    TSuccessResponse,
    TExtra
>): Promise<TSuccessResponse> => {
    try {
        return await withTransaction(fastify, async (tx) => {
            const poll = await lockPollById(tx, pollId);

            if (!poll) {
                throw createError(404, getNotFoundMessage(pollId));
            }

            const extra = loadExtra
                ? await loadExtra({
                      poll,
                      pollId,
                      tx,
                  })
                : (undefined as TExtra);
            const voter = await authenticateVoter(tx, pollId, voterToken);
            const existingSubmission = await loadExistingSubmission({
                db: tx,
                pollId,
                shouldLock: true,
                voterId: voter.id,
            });
            const replayedSubmission = resolveExistingVoterSubmission({
                existingSubmission,
                incomingValue,
                isEquivalent,
                conflictMessage,
                successResponse,
            });

            if (replayedSubmission) {
                return replayedSubmission;
            }

            const context = {
                extra,
                incomingValue,
                poll,
                pollId,
                tx,
                voter,
            };

            await validate?.(context);
            await run(context);

            return successResponse;
        });
    } catch (error) {
        if (!isConstraintViolation(error, uniqueConstraintName)) {
            throw error;
        }

        return await recoverDuplicateVoterSubmission({
            db: fastify.db,
            pollId,
            voterToken,
            incomingValue,
            loadExistingSubmission: async ({
                db,
                pollId: recoveryPollId,
                voterId,
            }) =>
                await loadExistingSubmission({
                    db,
                    pollId: recoveryPollId,
                    shouldLock: false,
                    voterId,
                }),
            isEquivalent,
            conflictMessage,
            missingSubmissionConflictMessage,
            successResponse,
        });
    }
};
