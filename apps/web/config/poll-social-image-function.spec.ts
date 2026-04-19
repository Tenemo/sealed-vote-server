import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const requireFromWorkspaceRoot = createRequire(
    path.resolve(process.cwd(), '..', '..', 'package.json'),
);

const {
    mockCreatePollSocialImageResponse,
    mockExtractPollSocialImageSlugFromPathname,
    mockExtractPollSocialImageVariantFromSearchParams,
    mockResolveSeoApiBaseUrl,
} = vi.hoisted(() => ({
    mockCreatePollSocialImageResponse: vi.fn(),
    mockExtractPollSocialImageSlugFromPathname: vi.fn(),
    mockExtractPollSocialImageVariantFromSearchParams: vi.fn(() => 'open'),
    mockResolveSeoApiBaseUrl: vi.fn(() => 'https://api.sealed.vote'),
}));

vi.mock('./poll-social-image.ts', () => ({
    createPollSocialImageResponse: mockCreatePollSocialImageResponse,
    extractPollSocialImageSlugFromPathname:
        mockExtractPollSocialImageSlugFromPathname,
    extractPollSocialImageVariantFromSearchParams:
        mockExtractPollSocialImageVariantFromSearchParams,
}));

vi.mock('./document-seo.ts', () => ({
    resolveSeoApiBaseUrl: mockResolveSeoApiBaseUrl,
}));

describe('poll social image Netlify function', () => {
    beforeEach(() => {
        vi.resetModules();
        mockCreatePollSocialImageResponse.mockReset();
        mockExtractPollSocialImageSlugFromPathname.mockReset();
        mockExtractPollSocialImageVariantFromSearchParams.mockReset();
        mockExtractPollSocialImageVariantFromSearchParams.mockReturnValue(
            'open',
        );
        mockResolveSeoApiBaseUrl.mockClear();
    });

    // This resolution check is a deployment guardrail. The function bundle runs
    // from a different root than the web app, so this test catches workspace
    // packaging regressions before Netlify does.
    test('can resolve the PNG renderer dependency from the workspace root', () => {
        expect(() =>
            requireFromWorkspaceRoot.resolve('@resvg/resvg-js'),
        ).not.toThrow();
    });

    test('serves the vote PNG route with cache headers on GET', async () => {
        mockCreatePollSocialImageResponse.mockResolvedValue({
            body: Uint8Array.from(pngSignature),
            headers: {
                'cache-control': 'public, max-age=0, must-revalidate',
                'content-type': 'image/png',
                'netlify-cdn-cache-control':
                    'public, durable, max-age=2592000, stale-while-revalidate=2592000',
            },
            status: 200,
        });

        const pollSocialImageModule =
            await import('../../../netlify/functions/poll-social-image');

        expect(pollSocialImageModule.config.path).toBe(
            '/social/polls/:slug.png',
        );

        const response = await pollSocialImageModule.default(
            new Request('https://sealed.vote/social/polls/test--4a39.png'),
            {
                params: {
                    slug: 'test--4a39',
                },
            },
        );

        expect(mockCreatePollSocialImageResponse).toHaveBeenCalledWith({
            apiBaseUrl: 'https://api.sealed.vote',
            pollSlug: 'test--4a39',
            signal: expect.any(AbortSignal),
            variant: 'open',
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(pngSignature);
    });

    test('uses the pathname fallback, passes the completed variant, and omits the body on HEAD', async () => {
        mockCreatePollSocialImageResponse.mockResolvedValue({
            body: Uint8Array.from(pngSignature),
            headers: {
                'cache-control':
                    'public, max-age=3600, stale-while-revalidate=86400',
                'content-type': 'image/png',
                'netlify-cdn-cache-control':
                    'public, durable, max-age=3600, stale-while-revalidate=86400',
            },
            status: 200,
        });
        mockExtractPollSocialImageSlugFromPathname.mockReturnValue(
            'budget-roadmap',
        );
        mockExtractPollSocialImageVariantFromSearchParams.mockReturnValue(
            'complete',
        );

        const pollSocialImageModule =
            await import('../../../netlify/functions/poll-social-image');
        const response = await pollSocialImageModule.default(
            new Request(
                'https://sealed.vote/social/polls/budget-roadmap.png?v=complete',
                {
                    method: 'HEAD',
                },
            ),
            {},
        );

        expect(mockExtractPollSocialImageSlugFromPathname).toHaveBeenCalledWith(
            '/social/polls/budget-roadmap.png',
        );
        expect(
            mockExtractPollSocialImageVariantFromSearchParams,
        ).toHaveBeenCalled();
        expect(mockCreatePollSocialImageResponse).toHaveBeenCalledWith({
            apiBaseUrl: 'https://api.sealed.vote',
            pollSlug: 'budget-roadmap',
            signal: expect.any(AbortSignal),
            variant: 'complete',
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(await response.text()).toBe('');
    });

    test('rejects unsupported methods', async () => {
        const pollSocialImageModule =
            await import('../../../netlify/functions/poll-social-image');
        const response = await pollSocialImageModule.default(
            new Request('https://sealed.vote/social/polls/test--4a39.png', {
                method: 'POST',
            }),
            {
                params: {
                    slug: 'test--4a39',
                },
            },
        );

        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
    });

    test('returns a safe 500 response when image rendering fails unexpectedly', async () => {
        mockCreatePollSocialImageResponse.mockRejectedValue(
            new Error('resvg exploded'),
        );

        const pollSocialImageModule =
            await import('../../../netlify/functions/poll-social-image');
        const response = await pollSocialImageModule.default(
            new Request('https://sealed.vote/social/polls/test--4a39.png'),
            {
                params: {
                    slug: 'test--4a39',
                },
            },
        );

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe(
            'no-store, max-age=0',
        );
        await expect(response.text()).resolves.toBe('Failed to render image.');
    });
});
