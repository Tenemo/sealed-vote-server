import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('publicKeyShare duplicate recovery branch', () => {
    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('passes the already-submitted message into duplicate recovery after a unique-key failure', async () => {
        const mockedRecoverDuplicateVoterSubmission = vi
            .fn()
            .mockResolvedValue({
                message: 'Public key share submitted successfully',
            });
        const mockedMaybeDropTestResponseAfterCommit = vi.fn();

        vi.doMock('../utils/db.js', () => ({
            isConstraintViolation: (
                error: { constraint?: string },
                constraint?: string,
            ) => error.constraint === constraint,
            withTransaction: vi.fn().mockRejectedValue({
                code: '23505',
                constraint: 'unique_public_key_share_per_voter',
            }),
        }));
        vi.doMock('../utils/testing.js', () => ({
            maybeDropTestResponseAfterCommit:
                mockedMaybeDropTestResponseAfterCommit,
        }));
        vi.doMock('../utils/voterSubmission.js', () => ({
            recoverDuplicateVoterSubmission:
                mockedRecoverDuplicateVoterSubmission,
            resolveExistingVoterSubmission: vi.fn(),
        }));

        const { publicKeyShare } = await import('./publicKeyShare');

        let routeHandler:
            | ((
                  request: {
                      body: {
                          publicKeyShare: string;
                          voterToken: string;
                      };
                      params: {
                          pollId: string;
                      };
                  },
                  reply: {
                      code: (statusCode: number) => void;
                  },
              ) => Promise<{
                  message: string;
              }>)
            | undefined;

        await publicKeyShare({
            db: {},
            post: vi.fn((_path, _options, handler) => {
                routeHandler = handler as typeof routeHandler;
            }),
        } as never);

        const reply = {
            code: vi.fn(),
        };

        const result = await routeHandler!(
            {
                body: {
                    publicKeyShare: '123',
                    voterToken: 'a'.repeat(64),
                },
                params: {
                    pollId: 'poll-1',
                },
            },
            reply,
        );

        expect(mockedRecoverDuplicateVoterSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                conflictMessage: ERROR_MESSAGES.publicKeyConflict,
                incomingValue: '123',
                missingSubmissionConflictMessage:
                    ERROR_MESSAGES.publicKeyAlreadySubmitted,
                pollId: 'poll-1',
                successResponse: {
                    message: 'Public key share submitted successfully',
                },
                voterToken: 'a'.repeat(64),
            }),
        );
        expect(reply.code).toHaveBeenCalledWith(201);
        expect(mockedMaybeDropTestResponseAfterCommit).toHaveBeenCalled();
        expect(result).toEqual({
            message: 'Public key share submitted successfully',
        });
    });
});
