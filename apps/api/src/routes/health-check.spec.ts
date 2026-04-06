import { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';

describe('GET /health-check', () => {
    let fastify: FastifyInstance;
    const originalRailwayGitCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA;
    const originalCommitRef = process.env.COMMIT_REF;
    const originalGithubSha = process.env.GITHUB_SHA;

    const restoreDeploymentCommitEnv = (): void => {
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
    };

    beforeAll(async () => {
        fastify = await buildServer(false);
    });

    afterEach(() => {
        restoreDeploymentCommitEnv();
    });

    afterAll(async () => {
        restoreDeploymentCommitEnv();
        await fastify.close();
    });

    test('returns the deployment commit SHA when available', async () => {
        process.env.RAILWAY_GIT_COMMIT_SHA = 'abcdef1234567890';

        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            service: 'OK',
            database: 'OK',
            commitSha: 'abcdef1234567890',
        });
    });

    test('returns the GitHub Actions commit SHA when available', async () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
        delete process.env.COMMIT_REF;
        process.env.GITHUB_SHA = '631133b6edbc77eb97572cbc6ff568ab2992b59e';

        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            service: 'OK',
            database: 'OK',
            commitSha: '631133b6edbc77eb97572cbc6ff568ab2992b59e',
        });
    });

    test('returns a null deployment commit SHA when none is configured', async () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
        delete process.env.COMMIT_REF;
        delete process.env.GITHUB_SHA;

        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            service: 'OK',
            database: 'OK',
            commitSha: null,
        });
    });
});
