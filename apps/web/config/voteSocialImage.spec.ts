import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
    createVoteSocialImageResponse,
    createVoteSocialImageRows,
    createVoteSocialImageSvg,
    extractVoteSocialImageSlugFromPathname,
    wrapVoteSocialImageTitle,
} from './voteSocialImage';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('wrapVoteSocialImageTitle', () => {
    test('wraps long vote titles into multiple lines', () => {
        expect(
            wrapVoteSocialImageTitle(
                'Quarterly roadmap alignment for platform migration',
            ),
        ).toEqual(['Quarterly roadmap', 'alignment for platform', 'migration']);
    });

    test('truncates very long vote titles safely', () => {
        const lines = wrapVoteSocialImageTitle(
            'This is a deliberately oversized vote title that keeps going long enough to require truncation on the final visible line of the preview image',
        );

        expect(lines.length).toBeGreaterThan(1);
        expect(lines.length).toBeLessThanOrEqual(3);
        expect(lines.at(-1)).toContain('...');
    });
});

describe('createVoteSocialImageRows', () => {
    test('renders the first three choices and a summary row for the rest', () => {
        expect(
            createVoteSocialImageRows([
                'Alpha',
                'Beta',
                'Gamma',
                'Delta',
                'Epsilon',
            ]),
        ).toEqual([
            { kind: 'choice', label: 'Alpha' },
            { kind: 'choice', label: 'Beta' },
            { kind: 'choice', label: 'Gamma' },
            { kind: 'summary', label: '+2 more' },
        ]);
    });

    test('falls back to generic rows when the vote has no usable choices', () => {
        expect(createVoteSocialImageRows(['', '   '])).toEqual([
            {
                kind: 'choice',
                label: 'Confidential browser voting',
            },
            {
                kind: 'choice',
                label: 'Homomorphic encryption',
            },
            {
                kind: 'choice',
                label: 'Public verification',
            },
        ]);
    });
});

describe('createVoteSocialImageSvg', () => {
    test('renders a generic branded fallback image when poll data is missing', () => {
        const svg = createVoteSocialImageSvg({
            choices: [],
            isFallback: true,
            pollTitle: null,
        });

        expect(svg).toContain('sealed.vote');
        expect(svg).toContain('Confidential 1-10 score voting');
        expect(svg).toContain('Public verification');
    });
});

describe('extractVoteSocialImageSlugFromPathname', () => {
    test('extracts the poll slug from vote social image routes', () => {
        expect(
            extractVoteSocialImageSlugFromPathname(
                '/social/votes/test--4a39.png',
            ),
        ).toBe('test--4a39');
    });

    test('returns null for unrelated routes', () => {
        expect(
            extractVoteSocialImageSlugFromPathname('/social/og-home.png'),
        ).toBeNull();
    });
});

describe('createVoteSocialImageResponse', () => {
    test('returns a PNG with long-lived cache headers for a real poll image', async () => {
        const response = await createVoteSocialImageResponse({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    choices: ['Alpha', 'Beta', 'Gamma', 'Delta'],
                    pollName: 'Quarterly roadmap',
                }),
            ),
            pollSlug: 'quarterly-roadmap',
        });

        expect(response.isFallback).toBe(false);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['cache-control']).toBe(
            'public, max-age=31536000, immutable',
        );
        expect(response.headers['netlify-cdn-cache-control']).toContain(
            'durable',
        );
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });

    test('returns a generic PNG with shorter cache headers when the poll cannot be loaded', async () => {
        const response = await createVoteSocialImageResponse({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
            pollSlug: 'missing-vote',
        });

        expect(response.isFallback).toBe(true);
        expect(response.headers['cache-control']).toBe(
            'public, max-age=3600, stale-while-revalidate=600',
        );
        expect(response.headers['netlify-cdn-cache-control']).toBe(
            'public, durable, max-age=3600, stale-while-revalidate=600',
        );
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });
});
