import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../build-server';

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

    test('allows the sealed.vote production origin', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'https://sealed.vote',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://sealed.vote',
        );
    });

    test('handles sealed.vote preflight requests for direct api access', async () => {
        const response = await fastify.inject({
            method: 'OPTIONS',
            url: '/api/polls/create',
            headers: {
                origin: 'https://sealed.vote',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
            },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://sealed.vote',
        );
        expect(response.headers['access-control-allow-methods']).toBe(
            'GET, HEAD, POST, DELETE, OPTIONS',
        );
        expect(
            response.headers['access-control-allow-headers']?.toLowerCase(),
        ).toContain('content-type');
    });

    test('allows localhost development origins', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'http://localhost:3000',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(
            'http://localhost:3000',
        );
    });

    test('allows 127.0.0.1 development origins', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'http://127.0.0.1:4173',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(
            'http://127.0.0.1:4173',
        );
    });

    test('allows Netlify deploy preview origins', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'https://deploy-preview-3--sealed-vote.netlify.app',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://deploy-preview-3--sealed-vote.netlify.app',
        );
    });

    test('allows the configured preview web origin', async () => {
        await fastify.close();
        process.env.WEB_APP_ORIGIN = 'https://preview-web.up.railway.app';
        fastify = await buildServer(false);

        const response = await fastify.inject({
            method: 'GET',
            url: '/api/health-check',
            headers: {
                origin: 'https://preview-web.up.railway.app',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://preview-web.up.railway.app',
        );
    });

    test('handles allowlisted preflight requests', async () => {
        const response = await fastify.inject({
            method: 'OPTIONS',
            url: '/api/polls/create',
            headers: {
                origin: 'https://www.sealed.vote',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
            },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://www.sealed.vote',
        );
        expect(response.headers['access-control-allow-methods']).toBe(
            'GET, HEAD, POST, DELETE, OPTIONS',
        );
        expect(
            response.headers['access-control-allow-headers']?.toLowerCase(),
        ).toContain('content-type');
    });

    test('handles deploy preview preflight requests', async () => {
        const response = await fastify.inject({
            method: 'OPTIONS',
            url: '/api/polls/create',
            headers: {
                origin: 'https://deploy-preview-42--sealed-vote.netlify.app',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
            },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://deploy-preview-42--sealed-vote.netlify.app',
        );
    });

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
                origin: 'https://deploy-preview-3--sealed-vote.netlify.app.evil.example',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});
