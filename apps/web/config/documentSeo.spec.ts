import { describe, expect, test, vi } from 'vitest';

import {
    createPollSeoPayloadCache,
    extractVoteSlugFromPathname,
    fetchPollTitle,
    renderDocumentHtml,
    resolveDocumentSeoMetadata,
    resolveSeoApiBaseUrl,
    shouldFetchPollSeoPayloadForRequest,
} from './documentSeo';

const baseHtml = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="sealed-vote-seo-start" content="1" />
        <title>placeholder</title>
        <meta name="sealed-vote-seo-end" content="1" />
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

    test('falls back to the production API origin for malformed urls', () => {
        expect(resolveSeoApiBaseUrl('api.example.com')).toBe(
            'https://api.sealed.vote',
        );
    });

    test('falls back to the production API origin for unsupported protocols', () => {
        expect(resolveSeoApiBaseUrl('ftp://api.example.com')).toBe(
            'https://api.sealed.vote',
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

    test('returns null for malformed encoded vote slugs', () => {
        expect(extractVoteSlugFromPathname('/votes/%E0%A4%A.png')).toBeNull();
    });
});

describe('shouldFetchPollSeoPayloadForRequest', () => {
    test('keeps dynamic poll metadata enabled when the request user-agent is unknown', () => {
        expect(shouldFetchPollSeoPayloadForRequest()).toBe(true);
    });

    test('skips poll metadata lookups for normal browser user-agents', () => {
        expect(
            shouldFetchPollSeoPayloadForRequest(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
            ),
        ).toBe(false);
    });

    test('keeps poll metadata lookups for crawler user-agents', () => {
        expect(
            shouldFetchPollSeoPayloadForRequest(
                'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
            ),
        ).toBe(true);
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

        expect(metadata.title).toBe('Budget & roadmap');
        expect(metadata.description).toBe('Score options from 1 to 10.');
        expect(metadata.canonicalUrl).toBe(
            'https://sealed.vote/votes/budget-roadmap',
        );
        expect(metadata.imageUrl).toBe(
            'https://sealed.vote/social/votes/budget-roadmap.png',
        );
        expect(metadata.robots).toBe(
            'noindex, nofollow, noarchive, max-image-preview:large',
        );
    });

    test('uses the completed image url for completed votes', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                    resultScores: [8.5, 6.25],
                    resultTallies: ['17', '11'],
                }),
            ),
            requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
        });

        expect(metadata.title).toBe('Budget & roadmap');
        expect(metadata.description).toBe('Voting results');
        expect(metadata.imageUrl).toBe(
            'https://sealed.vote/social/votes/budget-roadmap.png?v=complete',
        );
        expect(metadata.imageAlt).toBe(
            'Final results preview for Budget & roadmap on sealed.vote.',
        );
    });

    test('returns create-page SEO for the root route', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            requestUrl: new URL('https://sealed.vote/'),
        });

        expect(metadata.title).toBe('Create a vote');
        expect(metadata.imageUrl).toBe(
            'https://sealed.vote/social/og-home.png',
        );
        expect(metadata.robots).toBe('index, follow, max-image-preview:large');
        expect(metadata.canonicalUrl).toBe('https://sealed.vote/');
        expect(metadata.description).toBe(
            'Create votes, collect responses, and reveal results.',
        );
    });

    test('returns site SEO for non-root non-vote routes', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            requestUrl: new URL('https://sealed.vote/missing'),
        });

        expect(metadata.title).toBe('sealed.vote | 1-10 score voting app');
        expect(metadata.description).toBe(
            'Create votes, collect responses, and reveal results.',
        );
        expect(metadata.canonicalUrl).toBe('https://sealed.vote/missing');
    });

    test('skips poll lookups for normal browser navigations and returns generic vote metadata', async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                pollName: 'Budget & roadmap',
            }),
        );

        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl,
            requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
            requestUserAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        });

        expect(metadata.title).toBe('Vote | sealed.vote');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('still enriches vote metadata for crawler requests', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                }),
            ),
            requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
            requestUserAgent:
                'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        });

        expect(metadata.title).toBe('Budget & roadmap');
    });

    test('falls back when a crawler poll lookup never resolves before the timeout', async () => {
        let lookupSignal: AbortSignal | undefined;

        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.sealed.vote',
            fetchImpl: vi.fn(async (_input, init) => {
                lookupSignal = init?.signal;

                return await new Promise<Response>(() => {
                    // Keep the lookup pending to emulate a stuck edge-side
                    // fetch without relying on AbortSignal support.
                });
            }),
            pollPayloadLookupTimeoutMs: 1,
            requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
            requestUserAgent:
                'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        });

        expect(metadata.title).toBe('Vote | sealed.vote');
        expect(metadata.description).toBe('Score options from 1 to 10.');
        expect(lookupSignal?.aborted).toBe(true);
    });

    test('caches open vote SEO payloads for a short interval', async () => {
        const pollPayloadCache = createPollSeoPayloadCache();
        let nowMs = 1_000;
        const fetchImpl = vi.fn(async () =>
            Response.json({
                pollName: 'Budget roadmap',
                resultScores: [],
            }),
        );
        const resolveMetadata = async (): Promise<void> => {
            await resolveDocumentSeoMetadata({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                now: () => nowMs,
                pollPayloadCache,
                requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
            });
        };

        await resolveMetadata();
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        nowMs += 5_001;
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('keeps completed vote SEO payloads cached longer than open votes', async () => {
        const pollPayloadCache = createPollSeoPayloadCache();
        let nowMs = 10_000;
        const fetchImpl = vi.fn(async () =>
            Response.json({
                pollName: 'Budget roadmap',
                resultScores: [9.25],
            }),
        );
        const resolveMetadata = async (): Promise<void> => {
            await resolveDocumentSeoMetadata({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                now: () => nowMs,
                pollPayloadCache,
                requestUrl: new URL('https://sealed.vote/votes/budget-roadmap'),
            });
        };

        await resolveMetadata();
        nowMs += 5_001;
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        nowMs += 55_000;
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('bounds the poll SEO payload cache', async () => {
        const pollPayloadCache = createPollSeoPayloadCache();
        const fetchImpl = vi.fn(
            async (requestInput: Request | URL | string) => {
                const requestUrl =
                    requestInput instanceof Request
                        ? new URL(requestInput.url)
                        : new URL(requestInput);

                return Response.json({
                    pollName: requestUrl.pathname.split('/').pop(),
                    resultScores: [],
                });
            },
        );

        for (let index = 0; index < 140; index += 1) {
            await resolveDocumentSeoMetadata({
                apiBaseUrl: 'https://api.sealed.vote',
                fetchImpl,
                pollPayloadCache,
                requestUrl: new URL(
                    `https://sealed.vote/votes/cache-test-${index}`,
                ),
            });
        }

        expect(fetchImpl).toHaveBeenCalledTimes(140);
        expect(pollPayloadCache.size).toBeLessThanOrEqual(128);
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
                    resultScores: [9.25],
                }),
            ),
            requestUrl: new URL('https://sealed.vote/votes/team-sync'),
        });

        expect(html).toContain(
            '<title data-rh="true">Team &lt;sync&gt; &quot;Q2&quot;</title>',
        );
        expect(html).toContain('content="https://sealed.vote/votes/team-sync"');
        expect(html).toContain(
            'content="https://sealed.vote/social/votes/team-sync.png?v=complete"',
        );
        expect(html).toContain(
            '<link data-rh="true" rel="canonical" href="https://sealed.vote/votes/team-sync"',
        );
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

        expect(html).toContain(
            '<title data-rh="true">Vote | sealed.vote</title>',
        );
        expect(html).toContain('content="Score options from 1 to 10."');
    });

    test('injects request-origin create-page metadata for preview domains', async () => {
        const html = await renderDocumentHtml({
            baseHtml,
            requestUrl: new URL(
                'https://deploy-preview-11--sealed-vote.netlify.app/',
            ),
        });

        expect(html).toContain(
            '<link data-rh="true" rel="canonical" href="https://deploy-preview-11--sealed-vote.netlify.app/"',
        );
        expect(html).toContain('<title data-rh="true">Create a vote</title>');
        expect(html).toContain(
            'content="Create votes, collect responses, and reveal results."',
        );
        expect(html).toContain(
            'content="https://deploy-preview-11--sealed-vote.netlify.app/"',
        );
        expect(html).not.toContain('href="https://sealed.vote/"');
    });
});
