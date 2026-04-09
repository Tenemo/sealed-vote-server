import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
    createVoteSocialImagePayloadForVariant,
    createVoteSocialImageResponse,
    createVoteSocialImageSvg,
    extractVoteSocialImageSlugFromPathname,
    extractVoteSocialImageVariantFromSearchParams,
    renderVoteSocialImagePngWithFallback,
} from './voteSocialImage';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('createVoteSocialImageSvg', () => {
    test('renders the open poll title and first choices into the SVG card', () => {
        const svg = createVoteSocialImageSvg({
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
        const svg = createVoteSocialImageSvg({
            choices: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'],
            isComplete: false,
            pollTitle: 'Fish & Chips <Friday>',
            resultScores: [],
        });

        expect(svg).toContain('Fish &amp; Chips');
        expect(svg).toContain('&lt;Friday&gt;');
        expect(svg).toContain('+2 more');
    });

    test('uses tighter truncation for long choice labels in the preview panel', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Long bong Long bong Long bong Long bong', 'Short'],
            isComplete: false,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [],
        });

        expect(svg).toContain('Long bong Lon...');
        expect(svg).not.toContain('Long bong Long...');
    });

    test('wraps longer vote titles before they collide with the choices panel', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Matematyka', 'Biologia', 'Chemia'],
            isComplete: false,
            pollTitle: 'Ulubiony przedmiot?',
            resultScores: [],
        });

        expect(svg).toContain('Ulubiony');
        expect(svg).toContain('przedmiot?');
    });

    test('ellipsizes the last visible title line when more words remain', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: false,
            pollTitle: 'favorite favorite favorite favorite favorite',
            resultScores: [],
        });

        expect(svg).toContain('favorite...');
    });

    test('does not ellipsize title lines when the title fits exactly', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: false,
            pollTitle: '1234567890abcdef ghijklmnopqrstuv wxyz123456789012',
            resultScores: [],
        });

        expect(svg).toContain('1234567890abcdef');
        expect(svg).toContain('ghijklmnopqrstuv');
        expect(svg).toContain('wxyz123456789012');
        expect(svg).not.toContain('wxyz123456789...');
    });

    test('ellipsizes a single long title token instead of letting it overflow', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: false,
            pollTitle: 'favorite-favorite-favorite-favor--6fa446f6',
            resultScores: [],
        });

        expect(svg).toContain('favorite-favo...');
    });

    test('ellipsizes a long word even when it starts a later title line', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Apples', 'Bananas', 'Pears'],
            isComplete: false,
            pollTitle:
                'Best favorite-favorite-favorite-favor--6fa446f6 breakfast',
            resultScores: [],
        });

        expect(svg).toContain('favorite-favo...');
    });

    test('renders final results for completed polls in score order', () => {
        const svg = createVoteSocialImageSvg({
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

    test('uses visual-width truncation for long result labels', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Long bong Long bong Long bong Long bong', 'Short'],
            isComplete: true,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [9, 8],
        });

        expect(svg).toContain('Long bong Lon...');
        expect(svg).not.toContain('Long bong Long...');
    });

    test('renders a clear empty state when a completed poll has no results', () => {
        const svg = createVoteSocialImageSvg({
            choices: ['Apples', 'Bananas'],
            isComplete: true,
            pollTitle: 'Best fruit for breakfast',
            resultScores: [],
        });

        expect(svg).toContain('No submitted scores');
        expect(svg).toContain('2 choices were available.');
    });
});

describe('createVoteSocialImagePayloadForVariant', () => {
    test('keeps the open card stable even if results are available', () => {
        expect(
            createVoteSocialImagePayloadForVariant({
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
            createVoteSocialImagePayloadForVariant({
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

describe('extractVoteSocialImageVariantFromSearchParams', () => {
    test('parses the completed image version from the query string', () => {
        expect(
            extractVoteSocialImageVariantFromSearchParams(
                new URLSearchParams('v=complete'),
            ),
        ).toBe('complete');
    });

    test('falls back to the open image variant', () => {
        expect(
            extractVoteSocialImageVariantFromSearchParams(
                new URLSearchParams('v=legacy'),
            ),
        ).toBe('open');
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
                    resultScores: [6.5, 9.25, 7.75, 8.1],
                }),
            ),
            pollSlug: 'quarterly-roadmap',
            variant: 'open',
        });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['cache-control']).toBe(
            'public, max-age=31536000, immutable',
        );
        expect(response.headers['cdn-cache-control']).toContain('max-age=');
        expect(response.headers['netlify-cdn-cache-control']).toContain(
            'durable',
        );
        expect(Buffer.from(response.body).subarray(0, 8)).toEqual(pngSignature);
    });

    test('returns a generic PNG with shorter cache headers when the poll is not found', async () => {
        const response = await createVoteSocialImageResponse({
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
        const response = await createVoteSocialImageResponse({
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

describe('renderVoteSocialImagePngWithFallback', () => {
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
            renderVoteSocialImagePngWithFallback({
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
                'Failed to render vote social image, including fallback image.',
        });
        expect((thrownError as AggregateError).cause).toBe(fallbackRenderError);
        expect((thrownError as AggregateError).errors).toEqual([
            mainRenderError,
            fallbackRenderError,
        ]);
        expect(renderImpl).toHaveBeenCalledTimes(2);
    });
});
