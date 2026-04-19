import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
    createPollSocialImagePayloadForVariant,
    createPollSocialImageResponse,
    createPollSocialImageSvg,
    extractPollSocialImageSlugFromPathname,
    extractPollSocialImageVariantFromSearchParams,
    renderPollSocialImagePngWithFallback,
} from './poll-social-image';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('createPollSocialImageSvg', () => {
    test('renders the open poll title and first choices into the SVG card', () => {
        const svg = createPollSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: false,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [],
        });

        expect(svg).toContain('Best fruit for');
        expect(svg).toContain('breakfast');
        expect(svg).toContain('1-10 score vote');
        expect(svg).toContain('Choices');
        expect(svg).toContain('Apples');
        expect(svg).toContain('Bananas');
        expect(svg).toContain('3 choices');
    });

    test('escapes XML and summarizes extra choices', () => {
        const svg = createPollSocialImageSvg({
            choices: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'],
            isComplete: false,
            pollTitle: 'Fish & Chips <Friday>',
            resultScores: [],
        });

        expect(svg).toContain('Fish &amp; Chips');
        expect(svg).toContain('&lt;Friday&gt;');
        expect(svg).toContain('+2 more');
    });

    test('wraps longer poll titles before they collide with the choices panel', () => {
        const svg = createPollSocialImageSvg({
            choices: ['Matematyka', 'Biologia', 'Chemia'],
            isComplete: false,
            pollTitle: 'Ulubiony przedmiot?',
            resultScores: [],
        });

        expect(svg).toContain('Ulubiony');
        expect(svg).toContain('przedmiot?');
    });

    test('renders final results for completed polls in score order', () => {
        const svg = createPollSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: true,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [8.94, 9.5, 7.12],
        });

        expect(svg).toContain('Final results');
        expect(svg).toContain('Results');
        expect(svg).toContain('Bananas');
        expect(svg).not.toContain('9.50');
        expect(svg).not.toContain('8.94');
        expect(svg.indexOf('Bananas')).toBeLessThan(svg.indexOf('Apples'));
        expect(svg.indexOf('Apples')).toBeLessThan(svg.indexOf('Pears'));
    });

    test('renders a clear empty state when a completed poll has no results', () => {
        const svg = createPollSocialImageSvg({
            choices: ['Apples', 'Bananas'],
            isComplete: true,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [],
        });

        expect(svg).toContain('No submitted scores');
        expect(svg).toContain('2 choices were available.');
    });
});

describe('createPollSocialImagePayloadForVariant', () => {
    test('keeps the open card stable even if results are available', () => {
        expect(
            createPollSocialImagePayloadForVariant({
                payload: {
                    choices: ['Alpha', 'Beta'],
                    pollTitle: 'Quarterly roadmap',
                    resultScores: [4.2, 8.1],
                },
                variant: 'open',
            }),
        ).toEqual({
            choices: ['Alpha', 'Beta'],
            isComplete: false,
            pollTitle: 'Quarterly roadmap',
            resultScores: [],
        });
    });

    test('uses the completed card only when the completed variant is requested', () => {
        expect(
            createPollSocialImagePayloadForVariant({
                payload: {
                    choices: ['Alpha', 'Beta'],
                    pollTitle: 'Quarterly roadmap',
                    resultScores: [4.2, 8.1],
                },
                variant: 'complete',
            }),
        ).toEqual({
            choices: ['Alpha', 'Beta'],
            isComplete: true,
            pollTitle: 'Quarterly roadmap',
            resultScores: [4.2, 8.1],
        });
    });
});

describe('extractPollSocialImageSlugFromPathname', () => {
    test('extracts the poll slug from poll social image routes', () => {
        expect(
            extractPollSocialImageSlugFromPathname(
                '/social/polls/test--4a39.png',
            ),
        ).toBe('test--4a39');
    });

    test('returns null for unrelated routes', () => {
        expect(
            extractPollSocialImageSlugFromPathname('/social/og-home.png'),
        ).toBeNull();
    });

    test('returns null for malformed encoded poll slugs', () => {
        expect(
            extractPollSocialImageSlugFromPathname(
                '/social/polls/%E0%A4%A.png',
            ),
        ).toBeNull();
    });
});

describe('extractPollSocialImageVariantFromSearchParams', () => {
    test('parses the completed image version from the query string', () => {
        expect(
            extractPollSocialImageVariantFromSearchParams(
                new URLSearchParams('v=complete'),
            ),
        ).toBe('complete');
    });

    test('falls back to the open image variant', () => {
        expect(
            extractPollSocialImageVariantFromSearchParams(
                new URLSearchParams('v=legacy'),
            ),
        ).toBe('open');
    });
});

describe('createPollSocialImageResponse', () => {
    test('returns a PNG with revalidated browser cache headers for a real poll image', async () => {
        const response = await createPollSocialImageResponse({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    choices: ['Alpha', 'Beta', 'Gamma', 'Delta'],
                    pollName: 'Quarterly roadmap',
                    resultScores: [6.5, 9.25, 7.75, 8.1],
                }),
            ),
            pollSlug: 'quarterly-roadmap',
            variant: 'open',
        });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['cache-control']).toBe(
            'public, max-age=0, must-revalidate',
        );
        expect(response.headers['cdn-cache-control']).toContain('max-age=');
        expect(response.headers['netlify-cdn-cache-control']).toContain(
            'durable',
        );
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });

    test('returns a generic PNG with shorter cache headers when the poll is not found', async () => {
        const response = await createPollSocialImageResponse({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
            pollSlug: 'missing-vote',
            variant: 'open',
        });

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe(
            'public, max-age=3600, stale-while-revalidate=86400',
        );
        expect(response.headers['netlify-cdn-cache-control']).toBe(
            'public, durable, max-age=3600, stale-while-revalidate=86400',
        );
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });

    test('returns a no-store image and 503 when the poll data is unavailable', async () => {
        const response = await createPollSocialImageResponse({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () => new Response(null, { status: 500 })),
            pollSlug: 'unavailable-vote',
            variant: 'complete',
        });

        expect(response.status).toBe(503);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['cdn-cache-control']).toBe('no-store');
        expect(response.headers['netlify-cdn-cache-control']).toBe('no-store');
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });
});

describe('renderPollSocialImagePngWithFallback', () => {
    test('throws a clear error when both the main and fallback renders fail', () => {
        const mainRenderError = new Error('main render failed');
        const fallbackRenderError = new Error('fallback render failed');
        const renderImpl = vi
            .fn()
            .mockImplementationOnce(() => {
                throw mainRenderError;
            })
            .mockImplementationOnce(() => {
                throw fallbackRenderError;
            });

        let thrownError: unknown;

        try {
            renderPollSocialImagePngWithFallback({
                payload: {
                    choices: ['Alpha'],
                    isComplete: false,
                    pollTitle: 'Quarterly roadmap',
                    resultScores: [],
                },
                renderImpl,
            });
        } catch (error) {
            thrownError = error;
        }

        expect(thrownError).toBeInstanceOf(AggregateError);
        expect(thrownError).toMatchObject({
            message:
                'Failed to render poll social image, including fallback image.',
        });
        expect((thrownError as AggregateError).cause).toBe(fallbackRenderError);
        expect((thrownError as AggregateError).errors).toEqual([
            mainRenderError,
            fallbackRenderError,
        ]);
        expect(renderImpl).toHaveBeenCalledTimes(2);
    });
});
