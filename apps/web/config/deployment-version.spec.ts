import { describe, expect, test } from 'vitest';

import { resolveDeploymentCommitSha } from './deployment-version';

describe('resolveDeploymentCommitSha', () => {
    // This config test looks deployment-specific, but it protects the commit
    // badge and health metadata across Netlify, Railway, GitHub Actions, and
    // local checkouts where the available source of truth differs.
    test('returns null when no deployment SHA is configured', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: undefined,
                    GITHUB_SHA: undefined,
                    RAILWAY_GIT_COMMIT_SHA: undefined,
                },
                () => null,
            ),
        ).toBeNull();
    });

    test('prefers the Netlify deployment SHA', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: 'ABCDEF1234567890',
                    GITHUB_SHA: '1111111111111111',
                    RAILWAY_GIT_COMMIT_SHA: '2222222222222222',
                },
                () => null,
            ),
        ).toBe('abcdef1234567890');
    });

    test('falls back to the Railway deployment SHA', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: undefined,
                    GITHUB_SHA: '1111111111111111',
                    RAILWAY_GIT_COMMIT_SHA: 'ABCDEF1234567890',
                },
                () => null,
            ),
        ).toBe('abcdef1234567890');
    });

    test('ignores invalid SHA values', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: 'not-a-sha',
                    GITHUB_SHA: '111',
                    RAILWAY_GIT_COMMIT_SHA: 'ABCDEF1234567890',
                },
                () => null,
            ),
        ).toBe('abcdef1234567890');
    });

    test('falls back to the checked out git HEAD when env vars are missing', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: undefined,
                    GITHUB_SHA: undefined,
                    RAILWAY_GIT_COMMIT_SHA: undefined,
                },
                () => 'ABCDEF1234567890',
            ),
        ).toBe('abcdef1234567890');
    });

    test('ignores an invalid git HEAD fallback', () => {
        expect(
            resolveDeploymentCommitSha(
                {
                    COMMIT_REF: undefined,
                    GITHUB_SHA: undefined,
                    RAILWAY_GIT_COMMIT_SHA: undefined,
                },
                () => 'not-a-sha',
            ),
        ).toBeNull();
    });
});
