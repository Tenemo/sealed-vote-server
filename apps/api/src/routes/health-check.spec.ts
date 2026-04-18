import { FastifyInstance } from 'fastify';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { buildServer } from '../build-server';

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
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        restoreDeploymentCommitEnv();
        await fastify.close();
    });

    test('returns service and database health for the live route', async () => {
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

    test('returns a 503 when the database probe throws', async () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
        delete process.env.COMMIT_REF;
        delete process.env.GITHUB_SHA;
        vi.spyOn(fastify.database, 'select').mockImplementation(() => {
            throw new Error('database unavailable');
        });

        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
        });

        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toEqual({
            service: 'OK',
            database: 'Failed',
            commitSha: null,
        });
    });
});
