import { afterEach, describe, expect, test } from 'vitest';

import { getConfiguredWebAppOrigin, getDeploymentCommitSha } from './config';

const originalWebAppOrigin = process.env.WEB_APP_ORIGIN;
const originalRailwayGitCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA;
const originalCommitRef = process.env.COMMIT_REF;
const originalGithubSha = process.env.GITHUB_SHA;

afterEach(() => {
    if (originalWebAppOrigin === undefined) {
        delete process.env.WEB_APP_ORIGIN;
    } else {
        process.env.WEB_APP_ORIGIN = originalWebAppOrigin;
    }

    if (originalRailwayGitCommitSha === undefined) {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
    } else {
        process.env.RAILWAY_GIT_COMMIT_SHA = originalRailwayGitCommitSha;
    }

    if (originalCommitRef === undefined) {
        delete process.env.COMMIT_REF;
    } else {
        process.env.COMMIT_REF = originalCommitRef;
    }

    if (originalGithubSha === undefined) {
        delete process.env.GITHUB_SHA;
    } else {
        process.env.GITHUB_SHA = originalGithubSha;
    }
});

describe('getConfiguredWebAppOrigin', () => {
    test('returns null when WEB_APP_ORIGIN is not set', () => {
        delete process.env.WEB_APP_ORIGIN;

        expect(getConfiguredWebAppOrigin()).toBeNull();
    });

    test('normalizes a configured origin to its origin value', () => {
        process.env.WEB_APP_ORIGIN = 'https://preview-web.up.railway.app/path';

        expect(getConfiguredWebAppOrigin()).toBe(
            'https://preview-web.up.railway.app',
        );
    });

    test('rejects invalid URLs', () => {
        process.env.WEB_APP_ORIGIN = 'not-a-url';

        expect(() => getConfiguredWebAppOrigin()).toThrow(
            'WEB_APP_ORIGIN must be a valid absolute URL.',
        );
    });

    test('rejects unsupported protocols', () => {
        process.env.WEB_APP_ORIGIN = 'ftp://preview-web.up.railway.app';

        expect(() => getConfiguredWebAppOrigin()).toThrow(
            'WEB_APP_ORIGIN must use http or https.',
        );
    });
});

describe('getDeploymentCommitSha', () => {
    test('returns null when no deployment commit SHA is available', () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
        delete process.env.COMMIT_REF;
        delete process.env.GITHUB_SHA;

        expect(getDeploymentCommitSha()).toBeNull();
    });

    test('prefers the Railway runtime commit SHA', () => {
        process.env.RAILWAY_GIT_COMMIT_SHA = 'ABCDEF1234567890';
        process.env.COMMIT_REF = '1111111111111111';
        process.env.GITHUB_SHA = '2222222222222222';

        expect(getDeploymentCommitSha()).toBe('abcdef1234567890');
    });

    test('falls back to the Netlify commit SHA', () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
        process.env.COMMIT_REF = 'abcdef1234567890';
        process.env.GITHUB_SHA = '1111111111111111';

        expect(getDeploymentCommitSha()).toBe('abcdef1234567890');
    });

    test('ignores invalid commit SHA values', () => {
        process.env.RAILWAY_GIT_COMMIT_SHA = 'not-a-commit';
        process.env.COMMIT_REF = '123';
        process.env.GITHUB_SHA = 'abcdef1234567890';

        expect(getDeploymentCommitSha()).toBe('abcdef1234567890');
    });
});
