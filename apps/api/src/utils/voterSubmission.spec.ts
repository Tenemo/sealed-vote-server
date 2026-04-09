import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedFindVoterByTokenReadOnly = vi.fn();

vi.mock('./voterAuth.js', () => ({
    findVoterByTokenReadOnly: (...args: unknown[]) =>
        mockedFindVoterByTokenReadOnly(...args),
}));

import {
    recoverDuplicateVoterSubmission,
    resolveExistingVoterSubmission,
} from './voterSubmission';

describe('resolveExistingVoterSubmission', () => {
    it('returns null when there is no existing submission yet', () => {
        expect(
            resolveExistingVoterSubmission({
                existingSubmission: undefined,
                incomingValue: 'incoming',
                isEquivalent: () => true,
                conflictMessage: 'conflict',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).toBeNull();
    });

    it('returns the success payload when the replayed submission is equivalent', () => {
        const successResponse = {
            message: 'ok',
        };

        expect(
            resolveExistingVoterSubmission({
                existingSubmission: {
                    value: 'stored',
                },
                incomingValue: 'stored',
                isEquivalent: (existingSubmission, incomingValue) =>
                    existingSubmission.value === incomingValue,
                conflictMessage: 'conflict',
                successResponse,
            }),
        ).toBe(successResponse);
    });

    it('throws a conflict when a replayed submission changes its payload', () => {
        expect(() =>
            resolveExistingVoterSubmission({
                existingSubmission: {
                    value: 'stored',
                },
                incomingValue: 'different',
                isEquivalent: (existingSubmission, incomingValue) =>
                    existingSubmission.value === incomingValue,
                conflictMessage: 'conflict',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).toThrow('conflict');
    });
});

describe('recoverDuplicateVoterSubmission', () => {
    beforeEach(() => {
        mockedFindVoterByTokenReadOnly.mockReset();
    });

    it('returns the success response when the stored submission matches the replayed payload', async () => {
        const db = {} as never;
        const loadExistingSubmission = vi.fn().mockResolvedValue({
            value: 'stored',
        });

        mockedFindVoterByTokenReadOnly.mockResolvedValue({
            id: 'voter-1',
            voterIndex: 1,
            voterName: 'Alice',
        });

        await expect(
            recoverDuplicateVoterSubmission<
                { value: string },
                string,
                { message: string }
            >({
                db,
                pollId: 'poll-1',
                voterToken: 'token',
                incomingValue: 'stored',
                loadExistingSubmission,
                isEquivalent: (existingSubmission, incomingValue) =>
                    existingSubmission.value === incomingValue,
                conflictMessage: 'conflict',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).resolves.toEqual({
            message: 'ok',
        });
        expect(loadExistingSubmission).toHaveBeenCalledWith({
            db,
            pollId: 'poll-1',
            voterId: 'voter-1',
        });
    });

    it('uses the missing-submission conflict when the voter cannot be recovered', async () => {
        mockedFindVoterByTokenReadOnly.mockResolvedValue(undefined);

        await expect(
            recoverDuplicateVoterSubmission<
                string,
                string,
                { message: string }
            >({
                db: {} as never,
                pollId: 'poll-1',
                voterToken: 'token',
                incomingValue: 'stored',
                loadExistingSubmission: vi.fn(),
                isEquivalent: () => true,
                conflictMessage: 'conflict',
                missingSubmissionConflictMessage: 'missing submission',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).rejects.toMatchObject({
            message: 'missing submission',
            statusCode: 409,
        });
    });

    it('uses the missing-submission conflict when the stored row disappeared after the duplicate insert failed', async () => {
        mockedFindVoterByTokenReadOnly.mockResolvedValue({
            id: 'voter-1',
            voterIndex: 1,
            voterName: 'Alice',
        });

        await expect(
            recoverDuplicateVoterSubmission<
                string,
                string,
                { message: string }
            >({
                db: {} as never,
                pollId: 'poll-1',
                voterToken: 'token',
                incomingValue: 'stored',
                loadExistingSubmission: vi.fn().mockResolvedValue(undefined),
                isEquivalent: () => true,
                conflictMessage: 'conflict',
                missingSubmissionConflictMessage: 'missing submission',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).rejects.toMatchObject({
            message: 'missing submission',
            statusCode: 409,
        });
    });

    it('falls back to the generic conflict when no specialized missing-submission message is provided', async () => {
        mockedFindVoterByTokenReadOnly.mockResolvedValue({
            id: 'voter-1',
            voterIndex: 1,
            voterName: 'Alice',
        });

        await expect(
            recoverDuplicateVoterSubmission<
                { value: string },
                string,
                { message: string }
            >({
                db: {} as never,
                pollId: 'poll-1',
                voterToken: 'token',
                incomingValue: 'different',
                loadExistingSubmission: vi.fn().mockResolvedValue({
                    value: 'stored',
                }),
                isEquivalent: (existingSubmission, incomingValue) =>
                    existingSubmission.value === incomingValue,
                conflictMessage: 'conflict',
                successResponse: {
                    message: 'ok',
                },
            }),
        ).rejects.toMatchObject({
            message: 'conflict',
            statusCode: 409,
        });
    });
});
