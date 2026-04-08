import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
    createVoteSocialImageResponse,
    createVoteSocialImageRows,
    createVoteSocialImageSvg,
    extractVoteSocialImageSlugFromPathname,
    renderVoteSocialImagePngWithFallback,
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

    test('renders the highest-ranked completed results with score labels', () => {
        expect(
            createVoteSocialImageRows(
                ['Alpha', 'Beta', 'Gamma', 'Delta'],
                [6.5, 9.25, 7.75, 8.1],
            ),
        ).toEqual([
            { kind: 'choice', label: 'Beta', scoreLabel: '9.25' },
            { kind: 'choice', label: 'Delta', scoreLabel: '8.10' },
            { kind: 'choice', label: 'Gamma', scoreLabel: '7.75' },
            { kind: 'summary', label: '+1 more choices' },
        ]);
    });

    test('preserves choice-to-score indices when invalid placeholders are present', () => {
        expect(
            createVoteSocialImageRows(
                ['Alpha', '', 'Gamma', 'Delta'],
                [6.5, 9.25, Number.NaN, 8.1],
            ),
        ).toEqual([
            { kind: 'choice', label: 'Delta', scoreLabel: '8.10' },
            { kind: 'choice', label: 'Alpha', scoreLabel: '6.50' },
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
            isComplete: false,
            isFallback: true,
            pollTitle: null,
            resultScores: [],
        });

        expect(svg).toContain('sealed.vote');
        expect(svg).toContain('Public verification');
        expect(svg).not.toContain('Vote preview');
        expect(svg).not.toContain('Share this link to let participants join');
        expect(svg).not.toContain('Confidential 1-10 score voting');
        expect(svg).not.toContain(
            'Homomorphic encryption | offline recovery | public verification',
        );
        expect(svg).not.toContain(
            'width="1056" height="286" rx="10" fill="#161616" stroke="#343434"',
        );
    });

    test('renders a completed-results layout when published scores are available', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Alpha', 'Beta', 'Gamma'],
            isComplete: true,
            isFallback: false,
            pollTitle: 'Quarterly roadmap',
            resultScores: [6.25, 9.5, 8.1],
        });

        expect(svg).toContain('Completed');
        expect(svg).toContain('Final results');
        expect(svg).toContain('9.50');
        expect(svg).toContain('Beta');
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

    test('returns null for malformed encoded vote slugs', () => {
        expect(
            extractVoteSocialImageSlugFromPathname(
                '/social/votes/%E0%A4%A.png',
            ),
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

describe('renderVoteSocialImagePngWithFallback', () => {
    test('throws a clear error when both the main and fallback renders fail', () => {
        const renderImpl = vi
            .fn()
            .mockImplementationOnce(() => {
                throw new Error('main render failed');
            })
            .mockImplementationOnce(() => {
                throw new Error('fallback render failed');
            });

        expect(() =>
            renderVoteSocialImagePngWithFallback({
                payload: {
                    choices: ['Alpha'],
                    isComplete: false,
                    isFallback: false,
                    pollTitle: 'Quarterly roadmap',
                    resultScores: [],
                },
                renderImpl,
            }),
        ).toThrow(
            'Failed to render vote social image, including fallback image.',
        );
        expect(renderImpl).toHaveBeenCalledTimes(2);
    });
});
