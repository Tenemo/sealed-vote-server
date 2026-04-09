import createError from 'http-errors';
import { afterEach, describe, expect, it, vi } from 'vitest';

const basePoll = {
    commonPublicKey: null,
    encryptedTallies: [],
    id: 'poll-1',
    isOpen: false,
    resultScores: [],
} as const;

const baseVoter = {
    id: 'voter-1',
    voterIndex: 0,
    voterName: 'Alice',
} as const;

type PollPhaseSubmissionTestSetup = {
    mockedAuthenticateVoter: ReturnType<typeof vi.fn>;
    mockedIsConstraintViolation: ReturnType<typeof vi.fn>;
    mockedLockPollById: ReturnType<typeof vi.fn>;
    mockedRecoverDuplicateVoterSubmission: ReturnType<typeof vi.fn>;
    mockedWithTransaction: ReturnType<typeof vi.fn>;
    transaction: {
        marker: string;
    };
};

const createSetup = (
    options: {
        authenticateVoter?: () => Promise<typeof baseVoter>;
        isConstraintViolation?: (
            error: unknown,
            constraintName: string,
        ) => boolean;
        lockPollById?: () => Promise<typeof basePoll | undefined>;
        recoverDuplicateVoterSubmission?: () => Promise<{
            message: string;
        }>;
        withTransaction?: (
            callback: (tx: { marker: string }) => Promise<unknown>,
        ) => Promise<unknown>;
    } = {},
): PollPhaseSubmissionTestSetup => {
    const transaction = {
        marker: 'tx',
    };
    const mockedWithTransaction = vi.fn(
        async (
            _fastify: unknown,
            callback: (tx: typeof transaction) => Promise<unknown>,
        ) =>
            await (options.withTransaction
                ? options.withTransaction(callback)
                : callback(transaction)),
    );
    const mockedIsConstraintViolation = vi.fn(
        options.isConstraintViolation ?? (() => false),
    );
    const mockedLockPollById = vi.fn(
        options.lockPollById ?? (async () => basePoll),
    );
    const mockedAuthenticateVoter = vi.fn(
        options.authenticateVoter ?? (async () => baseVoter),
    );
    const mockedRecoverDuplicateVoterSubmission = vi.fn(
        options.recoverDuplicateVoterSubmission ??
            (async () => ({
                message: 'ok',
            })),
    );

    return {
        mockedAuthenticateVoter,
        mockedIsConstraintViolation,
        mockedLockPollById,
        mockedRecoverDuplicateVoterSubmission,
        mockedWithTransaction,
        transaction,
    };
};

afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe('executeVoterPhaseSubmission', () => {
    it('runs the first submission inside a transaction', async () => {
        const setup = createSetup();
        const loadExistingSubmission = vi.fn().mockResolvedValue(undefined);
        const loadExtra = vi.fn().mockResolvedValue({
            isFinalSubmission: false,
            voterCount: 3,
        });
        const validate = vi.fn();
        const run = vi.fn().mockResolvedValue(undefined);
        const successResponse = {
            message: 'ok',
        };

        vi.doMock('./db.js', () => ({
            isConstraintViolation: setup.mockedIsConstraintViolation,
            withTransaction: setup.mockedWithTransaction,
        }));
        vi.doMock('./pollLocks.js', () => ({
            lockPollById: setup.mockedLockPollById,
        }));
        vi.doMock('./voterAuth.js', () => ({
            authenticateVoter: setup.mockedAuthenticateVoter,
        }));

        const { executeVoterPhaseSubmission } =
            await import('./pollPhaseSubmission.js');

        await expect(
            executeVoterPhaseSubmission({
                conflictMessage: 'conflict',
                fastify: {
                    db: {},
                } as never,
                incomingValue: 'payload',
                isEquivalent: (existingValue, incomingValue) =>
                    existingValue === incomingValue,
                loadExistingSubmission,
                loadExtra,
                pollId: 'poll-1',
                run,
                successResponse,
                uniqueConstraintName: 'unique_submission',
                validate,
                voterToken: 'token',
            }),
        ).resolves.toBe(successResponse);

        expect(loadExtra).toHaveBeenCalledWith({
            poll: basePoll,
            pollId: 'poll-1',
            tx: setup.transaction,
        });
        expect(loadExistingSubmission).toHaveBeenCalledWith({
            db: setup.transaction,
            pollId: 'poll-1',
            shouldLock: true,
            voterId: 'voter-1',
        });
        expect(validate).toHaveBeenCalledWith({
            extra: {
                isFinalSubmission: false,
                voterCount: 3,
            },
            incomingValue: 'payload',
            poll: basePoll,
            pollId: 'poll-1',
            tx: setup.transaction,
            voter: baseVoter,
        });
        expect(run).toHaveBeenCalledWith({
            extra: {
                isFinalSubmission: false,
                voterCount: 3,
            },
            incomingValue: 'payload',
            poll: basePoll,
            pollId: 'poll-1',
            tx: setup.transaction,
            voter: baseVoter,
        });
        expect(
            setup.mockedRecoverDuplicateVoterSubmission,
        ).not.toHaveBeenCalled();
    });

    it('recovers an idempotent retry after a lost response', async () => {
        const duplicateError = {
            code: '23505',
            constraint: 'unique_submission',
        };
        const setup = createSetup({
            isConstraintViolation: (error, constraintName) =>
                error === duplicateError &&
                constraintName === 'unique_submission',
            recoverDuplicateVoterSubmission: async () => ({
                message: 'ok',
            }),
            withTransaction: async () => {
                throw duplicateError;
            },
        });
        const loadExistingSubmission = vi.fn();

        vi.doMock('./db.js', () => ({
            isConstraintViolation: setup.mockedIsConstraintViolation,
            withTransaction: setup.mockedWithTransaction,
        }));
        vi.doMock('./pollLocks.js', () => ({
            lockPollById: setup.mockedLockPollById,
        }));
        vi.doMock('./voterAuth.js', () => ({
            authenticateVoter: setup.mockedAuthenticateVoter,
        }));
        vi.doMock('./voterSubmission.js', async () => {
            const actual = await vi.importActual<
                typeof import('./voterSubmission.js')
            >('./voterSubmission.js');

            return {
                ...actual,
                recoverDuplicateVoterSubmission:
                    setup.mockedRecoverDuplicateVoterSubmission,
            };
        });

        const { executeVoterPhaseSubmission } =
            await import('./pollPhaseSubmission.js');

        await expect(
            executeVoterPhaseSubmission({
                conflictMessage: 'conflict',
                fastify: {
                    db: {},
                } as never,
                incomingValue: 'payload',
                isEquivalent: (existingValue, incomingValue) =>
                    existingValue === incomingValue,
                loadExistingSubmission,
                missingSubmissionConflictMessage: 'missing submission',
                pollId: 'poll-1',
                run: vi.fn(),
                successResponse: {
                    message: 'ok',
                },
                uniqueConstraintName: 'unique_submission',
                voterToken: 'token',
            }),
        ).resolves.toEqual({
            message: 'ok',
        });

        expect(
            setup.mockedRecoverDuplicateVoterSubmission,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                conflictMessage: 'conflict',
                incomingValue: 'payload',
                loadExistingSubmission: expect.any(Function),
                missingSubmissionConflictMessage: 'missing submission',
                pollId: 'poll-1',
                successResponse: {
                    message: 'ok',
                },
                voterToken: 'token',
            }),
        );
    });

    it('rejects the submission when validation fails for the current phase', async () => {
        const setup = createSetup();
        const run = vi.fn();

        vi.doMock('./db.js', () => ({
            isConstraintViolation: setup.mockedIsConstraintViolation,
            withTransaction: setup.mockedWithTransaction,
        }));
        vi.doMock('./pollLocks.js', () => ({
            lockPollById: setup.mockedLockPollById,
        }));
        vi.doMock('./voterAuth.js', () => ({
            authenticateVoter: setup.mockedAuthenticateVoter,
        }));

        const { executeVoterPhaseSubmission } =
            await import('./pollPhaseSubmission.js');

        await expect(
            executeVoterPhaseSubmission({
                conflictMessage: 'conflict',
                fastify: {
                    db: {},
                } as never,
                incomingValue: 'payload',
                isEquivalent: (existingValue, incomingValue) =>
                    existingValue === incomingValue,
                loadExistingSubmission: vi.fn().mockResolvedValue(undefined),
                pollId: 'poll-1',
                run,
                successResponse: {
                    message: 'ok',
                },
                uniqueConstraintName: 'unique_submission',
                validate: () => {
                    throw createError(400, 'phase closed');
                },
                voterToken: 'token',
            }),
        ).rejects.toMatchObject({
            message: 'phase closed',
            statusCode: 400,
        });

        expect(run).not.toHaveBeenCalled();
    });

    it('rejects the submission when voter authentication fails', async () => {
        const setup = createSetup({
            authenticateVoter: async () => {
                throw createError(403, 'invalid token');
            },
        });
        const loadExistingSubmission = vi.fn();
        const run = vi.fn();

        vi.doMock('./db.js', () => ({
            isConstraintViolation: setup.mockedIsConstraintViolation,
            withTransaction: setup.mockedWithTransaction,
        }));
        vi.doMock('./pollLocks.js', () => ({
            lockPollById: setup.mockedLockPollById,
        }));
        vi.doMock('./voterAuth.js', () => ({
            authenticateVoter: setup.mockedAuthenticateVoter,
        }));

        const { executeVoterPhaseSubmission } =
            await import('./pollPhaseSubmission.js');

        await expect(
            executeVoterPhaseSubmission({
                conflictMessage: 'conflict',
                fastify: {
                    db: {},
                } as never,
                incomingValue: 'payload',
                isEquivalent: (existingValue, incomingValue) =>
                    existingValue === incomingValue,
                loadExistingSubmission,
                pollId: 'poll-1',
                run,
                successResponse: {
                    message: 'ok',
                },
                uniqueConstraintName: 'unique_submission',
                voterToken: 'token',
            }),
        ).rejects.toMatchObject({
            message: 'invalid token',
            statusCode: 403,
        });

        expect(loadExistingSubmission).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('passes the final-submission context through so aggregation can run once', async () => {
        const setup = createSetup();
        let didPublishAggregate = false;

        vi.doMock('./db.js', () => ({
            isConstraintViolation: setup.mockedIsConstraintViolation,
            withTransaction: setup.mockedWithTransaction,
        }));
        vi.doMock('./pollLocks.js', () => ({
            lockPollById: setup.mockedLockPollById,
        }));
        vi.doMock('./voterAuth.js', () => ({
            authenticateVoter: setup.mockedAuthenticateVoter,
        }));

        const { executeVoterPhaseSubmission } =
            await import('./pollPhaseSubmission.js');

        await expect(
            executeVoterPhaseSubmission<
                string[],
                string[],
                { message: string },
                {
                    existingSubmissionCount: number;
                    voterCount: number;
                }
            >({
                conflictMessage: 'conflict',
                fastify: {
                    db: {},
                } as never,
                incomingValue: ['share-1', 'share-2'],
                isEquivalent: (existingValue, incomingValue) =>
                    existingValue.length === incomingValue.length,
                loadExistingSubmission: vi.fn().mockResolvedValue(undefined),
                loadExtra: vi.fn().mockResolvedValue({
                    existingSubmissionCount: 1,
                    voterCount: 2,
                }),
                pollId: 'poll-1',
                run: async ({ extra }) => {
                    didPublishAggregate =
                        extra.existingSubmissionCount + 1 === extra.voterCount;
                },
                successResponse: {
                    message: 'ok',
                },
                uniqueConstraintName: 'unique_submission',
                voterToken: 'token',
            }),
        ).resolves.toEqual({
            message: 'ok',
        });

        expect(didPublishAggregate).toBe(true);
    });
});
