import { describe, expect, test, vi } from 'vitest';

import {
    extractVoteSlugFromPathname,
    fetchPollTitle,
    renderDocumentHtml,
    resolveDocumentSeoMetadata,
    resolveSeoApiBaseUrl,
} from './documentSeo';

const baseHtml = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="sealed-vote-seo-start" content="1" />
        <title>placeholder</title>
        <meta name="sealed-vote-seo-end" content="1" />
        <script defer src="/browser-guard.js"></script>
    </head>
    <body>
        <div id="root"></div>
    </body>
</html>`;

describe('resolveSeoApiBaseUrl', () => {
    test('falls back to the production API origin', () => {
        expect(resolveSeoApiBaseUrl()).toBe('https://api.sealed.vote');
    });

    test('normalizes valid origins', () => {
        expect(resolveSeoApiBaseUrl('https://api.example.com/path')).toBe(
            'https://api.example.com',
        );
    });

    test('rejects unsupported protocols', () => {
        expect(() => resolveSeoApiBaseUrl('ftp://api.example.com')).toThrow(
            'SEO API base URL must use the http or https protocol.',
        );
    });
});

describe('extractVoteSlugFromPathname', () => {
    test('extracts the vote slug from vote routes', () => {
        expect(extractVoteSlugFromPathname('/votes/lunch-vote')).toBe(
            'lunch-vote',
        );
    });

    test('decodes encoded vote slugs', () => {
        expect(extractVoteSlugFromPathname('/votes/lunch%20vote')).toBe(
            'lunch vote',
        );
    });

    test('returns null for non-vote routes', () => {
        expect(extractVoteSlugFromPathname('/')).toBeNull();
        expect(extractVoteSlugFromPathname('/health-check')).toBeNull();
    });
});

describe('fetchPollTitle', () => {
    test('returns the poll title when the payload is valid', async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                pollName: 'Lunch vote',
            }),
        );

        await expect(
            fetchPollTitle({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                pollSlug: 'lunch-vote',
            }),
        ).resolves.toBe('Lunch vote');

        expect(fetchImpl).toHaveBeenCalledWith(
            new URL('/api/polls/lunch-vote', 'https://api.sealed.vote'),
            expect.objectContaining({
                headers: {
                    accept: 'application/json',
                },
            }),
        );
    });

    test('returns null when the backend responds with an error', async () => {
        const fetchImpl = vi.fn(
            async () => new Response(null, { status: 404 }),
        );

        await expect(
            fetchPollTitle({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                pollSlug: 'missing-vote',
            }),
        ).resolves.toBeNull();
    });

    test('returns null when the payload shape is invalid', async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                title: 'Lunch vote',
            }),
        );

        await expect(
            fetchPollTitle({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                pollSlug: 'lunch-vote',
            }),
        ).resolves.toBeNull();
    });
});

describe('resolveDocumentSeoMetadata', () => {
    test('returns vote-specific SEO with the exact vote title', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                }),
            ),
            requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
        });

        expect(metadata.title).toBe('Budget & roadmap | sealed.vote');
        expect(metadata.description).toContain('Budget & roadmap');
        expect(metadata.canonicalUrl).toBe(
            'https://sealed.vote/votes/budget-roadmap',
        );
        expect(metadata.robots).toBe('noindex, nofollow, noarchive');
    });

    test('returns homepage SEO for non-vote routes', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            requestUrl: new URL('https://sealed.vote/'),
        });

        expect(metadata.title).toBe('sealed.vote');
        expect(metadata.robots).toBe('index, follow');
        expect(metadata.canonicalUrl).toBe('https://sealed.vote/');
    });
});

describe('renderDocumentHtml', () => {
    test('injects vote metadata into the HTML document', async () => {
        const html = await renderDocumentHtml({
            apiBaseUrl: 'https://api.sealed.vote',
            baseHtml,
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Team <sync> "Q2"',
                }),
            ),
            requestUrl: new URL('https://sealed.vote/votes/team-sync'),
        });

        expect(html).toContain(
            '<title>Team &lt;sync&gt; &quot;Q2&quot; | sealed.vote</title>',
        );
        expect(html).toContain('content="https://sealed.vote/votes/team-sync"');
        expect(html).toContain('Team \\u003csync\\u003e \\"Q2\\"');
        expect(html).not.toContain('<title>placeholder</title>');
    });

    test('falls back to generic vote metadata when poll lookup fails', async () => {
        const html = await renderDocumentHtml({
            apiBaseUrl: 'https://api.sealed.vote',
            baseHtml,
            fetchImpl: vi.fn(async () => {
                throw new Error('offline');
            }),
            requestUrl: new URL('https://sealed.vote/votes/team-sync'),
        });

        expect(html).toContain('<title>Vote | sealed.vote</title>');
        expect(html).toContain(
            'content="Confidential participant vote page on sealed.vote."',
        );
    });
});
