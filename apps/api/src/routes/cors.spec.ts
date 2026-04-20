import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../build-server';

const corsMethods = 'GET, HEAD, POST, DELETE, OPTIONS';
const preflightHeaders = {
    'access-control-request-headers': 'content-type',
    'access-control-request-method': 'POST',
};

const expectAllowedOrigin = async ({
    fastify,
    origin,
}: {
    fastify: FastifyInstance;
    origin: string;
}): Promise<void> => {
    const response = await fastify.inject({
        method: 'GET',
        url: '/api/health-check',
        headers: {
            origin,
        },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
};

const expectAllowedPreflight = async ({
    fastify,
    origin,
}: {
    fastify: FastifyInstance;
    origin: string;
}): Promise<void> => {
    const response = await fastify.inject({
        method: 'OPTIONS',
        url: '/api/polls/create',
        headers: {
            origin,
            ...preflightHeaders,
        },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-methods']).toBe(corsMethods);
    expect(
        response.headers['access-control-allow-headers']?.toLowerCase(),
    ).toContain('content-type');
};

describe('CORS configuration', () => {
    let fastify: FastifyInstance;
    const originalWebAppOrigin = process.env.WEB_APP_ORIGIN;

    beforeAll(async () => {
        delete process.env.WEB_APP_ORIGIN;
        fastify = await buildServer(false);
    });

    afterAll(async () => {
        if (originalWebAppOrigin === undefined) {
            delete process.env.WEB_APP_ORIGIN;
        } else {
            process.env.WEB_APP_ORIGIN = originalWebAppOrigin;
        }

        await fastify.close();
    });

    for (const origin of [
        'https://elgamal.sealed.vote',
        'http://localhost:3000',
        'http://127.0.0.1:4173',
        'https://deploy-preview-3--sealed-vote-legacy.netlify.app',
    ]) {
        test(`allows ${origin} origins`, async () => {
            await expectAllowedOrigin({
                fastify,
                origin,
            });
        });
    }

    test('allows the configured preview web origin', async () => {
        await fastify.close();
        process.env.WEB_APP_ORIGIN = 'https://preview-web.up.railway.app';
        fastify = await buildServer(false);

        await expectAllowedOrigin({
            fastify,
            origin: 'https://preview-web.up.railway.app',
        });
    });

    for (const origin of [
        'https://elgamal.sealed.vote',
        'https://www.elgamal.sealed.vote',
        'https://deploy-preview-42--sealed-vote-legacy.netlify.app',
    ]) {
        test(`handles ${origin} preflight requests`, async () => {
            await expectAllowedPreflight({
                fastify,
                origin,
            });
        });
    }

    test('does not allow untrusted origins', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'https://evil.example',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('does not allow lookalike deploy preview origins', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'https://deploy-preview-3--sealed-vote-legacy.netlify.app.evil.example',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});
