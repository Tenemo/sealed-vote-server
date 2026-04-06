import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';

describe('GET /health-check', () => {
    let fastify: FastifyInstance;
    const originalRailwayGitCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA;

    beforeAll(async () => {
        fastify = await buildServer(false);
    });

    afterAll(async () => {
        if (originalRailwayGitCommitSha === undefined) {
            delete process.env.RAILWAY_GIT_COMMIT_SHA;
        } else {
            process.env.RAILWAY_GIT_COMMIT_SHA = originalRailwayGitCommitSha;
        }

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

    test('returns a null deployment commit SHA when none is configured', async () => {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;

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
