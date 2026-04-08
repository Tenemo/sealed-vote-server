import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const {
    mockCreateVoteSocialImageResponse,
    mockExtractVoteSocialImageSlugFromPathname,
    mockResolveSeoApiBaseUrl,
} = vi.hoisted(() => ({
    mockCreateVoteSocialImageResponse: vi.fn(),
    mockExtractVoteSocialImageSlugFromPathname: vi.fn(),
    mockResolveSeoApiBaseUrl: vi.fn(() => 'https://api.sealed.vote'),
}));

vi.mock('./voteSocialImage.ts', () => ({
    createVoteSocialImageResponse: mockCreateVoteSocialImageResponse,
    extractVoteSocialImageSlugFromPathname:
        mockExtractVoteSocialImageSlugFromPathname,
}));

vi.mock('./documentSeo.ts', () => ({
    resolveSeoApiBaseUrl: mockResolveSeoApiBaseUrl,
}));

describe('vote social image Netlify function', () => {
    beforeEach(() => {
        vi.resetModules();
        mockCreateVoteSocialImageResponse.mockReset();
        mockExtractVoteSocialImageSlugFromPathname.mockReset();
        mockResolveSeoApiBaseUrl.mockClear();
    });

    test('serves the vote PNG route with cache headers on GET', async () => {
        mockCreateVoteSocialImageResponse.mockResolvedValue({
            body: Uint8Array.from(pngSignature),
            headers: {
                'cache-control': 'public, max-age=31536000, immutable',
                'content-type': 'image/png',
                'netlify-cdn-cache-control':
                    'public, durable, max-age=31536000, stale-while-revalidate=604800',
            },
            isFallback: false,
        });

        const voteSocialImageModule =
            await import('../../../netlify/functions/vote-social-image');

        expect(voteSocialImageModule.config.path).toBe(
            '/social/votes/:slug.png',
        );

        const response = await voteSocialImageModule.default(
            new Request('https://sealed.vote/social/votes/test--4a39.png'),
            {
                params: {
                    slug: 'test--4a39',
                },
            },
        );

        expect(mockCreateVoteSocialImageResponse).toHaveBeenCalledWith({
            apiBaseUrl: 'https://api.sealed.vote',
            pollSlug: 'test--4a39',
            signal: expect.any(AbortSignal),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(pngSignature);
    });

    test('uses the pathname fallback and omits the body on HEAD', async () => {
        mockCreateVoteSocialImageResponse.mockResolvedValue({
            body: Uint8Array.from(pngSignature),
            headers: {
                'cache-control':
                    'public, max-age=3600, stale-while-revalidate=600',
                'content-type': 'image/png',
                'netlify-cdn-cache-control':
                    'public, durable, max-age=3600, stale-while-revalidate=600',
            },
            isFallback: true,
        });
        mockExtractVoteSocialImageSlugFromPathname.mockReturnValue(
            'budget-roadmap',
        );

        const voteSocialImageModule =
            await import('../../../netlify/functions/vote-social-image');
        const response = await voteSocialImageModule.default(
            new Request('https://sealed.vote/social/votes/budget-roadmap.png', {
                method: 'HEAD',
            }),
            {},
        );

        expect(mockExtractVoteSocialImageSlugFromPathname).toHaveBeenCalledWith(
            '/social/votes/budget-roadmap.png',
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(await response.text()).toBe('');
    });

    test('rejects unsupported methods', async () => {
        const voteSocialImageModule =
            await import('../../../netlify/functions/vote-social-image');
        const response = await voteSocialImageModule.default(
            new Request('https://sealed.vote/social/votes/test--4a39.png', {
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
        mockCreateVoteSocialImageResponse.mockRejectedValue(
            new Error('resvg exploded'),
        );

        const voteSocialImageModule =
            await import('../../../netlify/functions/vote-social-image');
        const response = await voteSocialImageModule.default(
            new Request('https://sealed.vote/social/votes/test--4a39.png'),
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
