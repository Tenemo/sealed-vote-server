import { describe, expect, test, vi } from 'vitest';

import {
    createPollSeoPayloadCache,
    extractPollSlugFromPathname,
    renderDocumentHtml,
    resolveDocumentSeoMetadata,
    resolveSeoApiBaseUrl,
    shouldFetchPollSeoPayloadForRequest,
} from './document-seo';

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
        expect(resolveSeoApiBaseUrl()).toBe('https://api.elgamal.sealed.vote');
    });

    test('normalizes valid origins', () => {
        expect(resolveSeoApiBaseUrl('https://api.example.com/path')).toBe(
            'https://api.example.com',
        );
    });

    test('falls back to the production API origin for malformed urls', () => {
        expect(resolveSeoApiBaseUrl('api.example.com')).toBe(
            'https://api.elgamal.sealed.vote',
        );
    });

    test('falls back to the production API origin for unsupported protocols', () => {
        expect(resolveSeoApiBaseUrl('ftp://api.example.com')).toBe(
            'https://api.elgamal.sealed.vote',
        );
    });
});

describe('extractPollSlugFromPathname', () => {
    test('extracts the poll slug from poll routes', () => {
        expect(extractPollSlugFromPathname('/polls/lunch-vote')).toBe(
            'lunch-vote',
        );
    });

    test('decodes encoded poll slugs', () => {
        expect(extractPollSlugFromPathname('/polls/lunch%20vote')).toBe(
            'lunch vote',
        );
    });

    test('returns null for non-poll routes', () => {
        expect(extractPollSlugFromPathname('/')).toBeNull();
        expect(extractPollSlugFromPathname('/health-check')).toBeNull();
    });

    test('returns null for malformed encoded poll slugs', () => {
        expect(extractPollSlugFromPathname('/polls/%E0%A4%A.png')).toBeNull();
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

describe('resolveDocumentSeoMetadata', () => {
    test('returns poll-specific SEO with the exact poll title', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                }),
            ),
            requestUrl: new URL(
                'https://elgamal.sealed.vote/polls/budget-roadmap',
            ),
        });

        expect(metadata.title).toBe('Budget & roadmap');
        expect(metadata.description).toBe('Score options from 1 to 10.');
        expect(metadata.canonicalUrl).toBe(
            'https://elgamal.sealed.vote/polls/budget-roadmap',
        );
        expect(metadata.imageUrl).toBe(
            'https://elgamal.sealed.vote/social/polls/budget-roadmap.png',
        );
        expect(metadata.robots).toBe(
            'noindex, nofollow, noarchive, max-image-preview:large',
        );
    });

    test('uses the completed image url for completed polls', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                    resultScores: [8.5, 6.25],
                    resultTallies: ['17', '11'],
                }),
            ),
            requestUrl: new URL(
                'https://elgamal.sealed.vote/polls/budget-roadmap',
            ),
        });

        expect(metadata.title).toBe('Budget & roadmap');
        expect(metadata.description).toBe('Poll results');
        expect(metadata.imageUrl).toBe(
            'https://elgamal.sealed.vote/social/polls/budget-roadmap.png?v=complete',
        );
        expect(metadata.imageAlt).toBe(
            'Final results preview for Budget & roadmap on sealed.vote legacy.',
        );
    });

    test('returns create-page SEO for the root route', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            requestUrl: new URL('https://elgamal.sealed.vote/'),
        });

        expect(metadata.title).toBe('Create a poll | sealed.vote legacy');
        expect(metadata.imageUrl).toBe(
            'https://elgamal.sealed.vote/social/og-home.png',
        );
        expect(metadata.robots).toBe('index, follow, max-image-preview:large');
        expect(metadata.canonicalUrl).toBe('https://elgamal.sealed.vote/');
        expect(metadata.description).toBe(
            'Legacy ElGamal research prototype for creating polls, collecting responses, and revealing results.',
        );
    });

    test('returns site SEO for non-root non-poll routes', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            requestUrl: new URL('https://elgamal.sealed.vote/missing'),
        });

        expect(metadata.title).toBe(
            'sealed.vote legacy | ElGamal research prototype',
        );
        expect(metadata.description).toBe(
            'Legacy ElGamal research prototype for creating polls, collecting responses, and revealing results.',
        );
        expect(metadata.canonicalUrl).toBe(
            'https://elgamal.sealed.vote/missing',
        );
    });

    test('skips poll lookups for normal browser navigations and returns generic poll metadata', async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                pollName: 'Budget & roadmap',
            }),
        );

        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            fetchImpl,
            requestUrl: new URL(
                'https://elgamal.sealed.vote/polls/budget-roadmap',
            ),
            requestUserAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        });

        expect(metadata.title).toBe('Poll | sealed.vote legacy');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('still enriches poll metadata for crawler requests', async () => {
        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Budget & roadmap',
                }),
            ),
            requestUrl: new URL(
                'https://elgamal.sealed.vote/polls/budget-roadmap',
            ),
            requestUserAgent:
                'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        });

        expect(metadata.title).toBe('Budget & roadmap');
    });

    test('falls back when a crawler poll lookup never resolves before the timeout', async () => {
        let lookupSignal: AbortSignal | undefined;

        const metadata = await resolveDocumentSeoMetadata({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            fetchImpl: vi.fn(async (_input, init) => {
                lookupSignal = init?.signal;

                return await new Promise<Response>(() => {
                    // Keep the lookup pending to emulate a stuck edge-side
                    // fetch without relying on AbortSignal support.
                });
            }),
            pollPayloadLookupTimeoutMs: 1,
            requestUrl: new URL(
                'https://elgamal.sealed.vote/polls/budget-roadmap',
            ),
            requestUserAgent:
                'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        });

        expect(metadata.title).toBe('Poll | sealed.vote legacy');
        expect(metadata.description).toBe('Score options from 1 to 10.');
        expect(lookupSignal?.aborted).toBe(true);
    });

    test('caches open poll SEO payloads for a short interval', async () => {
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
                apiBaseUrl: 'https://api.elgamal.sealed.vote',
                fetchImpl,
                now: () => nowMs,
                pollPayloadCache,
                requestUrl: new URL(
                    'https://elgamal.sealed.vote/polls/budget-roadmap',
                ),
            });
        };

        await resolveMetadata();
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        nowMs += 5_001;
        await resolveMetadata();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('keeps completed poll SEO payloads cached longer than open polls', async () => {
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
                apiBaseUrl: 'https://api.elgamal.sealed.vote',
                fetchImpl,
                now: () => nowMs,
                pollPayloadCache,
                requestUrl: new URL(
                    'https://elgamal.sealed.vote/polls/budget-roadmap',
                ),
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
                apiBaseUrl: 'https://api.elgamal.sealed.vote',
                fetchImpl,
                pollPayloadCache,
                requestUrl: new URL(
                    `https://elgamal.sealed.vote/polls/cache-test-${index}`,
                ),
            });
        }

        expect(fetchImpl).toHaveBeenCalledTimes(140);
        expect(pollPayloadCache.size).toBeLessThanOrEqual(128);
    });
});

describe('renderDocumentHtml', () => {
    test('injects poll metadata into the HTML document', async () => {
        const html = await renderDocumentHtml({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            baseHtml,
            fetchImpl: vi.fn(async () =>
                Response.json({
                    pollName: 'Team <sync> "Q2"',
                    resultScores: [9.25],
                }),
            ),
            requestUrl: new URL('https://elgamal.sealed.vote/polls/team-sync'),
        });

        expect(html).toContain(
            '<title data-rh="true">Team &lt;sync&gt; &quot;Q2&quot;</title>',
        );
        expect(html).toContain(
            'content="https://elgamal.sealed.vote/polls/team-sync"',
        );
        expect(html).toContain(
            'content="https://elgamal.sealed.vote/social/polls/team-sync.png?v=complete"',
        );
        expect(html).toContain(
            '<link data-rh="true" rel="canonical" href="https://elgamal.sealed.vote/polls/team-sync"',
        );
        expect(html).toContain('Team \\u003csync\\u003e \\"Q2\\"');
        expect(html).not.toContain('<title>placeholder</title>');
    });

    test('falls back to generic poll metadata when poll lookup fails', async () => {
        const html = await renderDocumentHtml({
            apiBaseUrl: 'https://api.elgamal.sealed.vote',
            baseHtml,
            fetchImpl: vi.fn(async () => {
                throw new Error('offline');
            }),
            requestUrl: new URL('https://elgamal.sealed.vote/polls/team-sync'),
        });

        expect(html).toContain(
            '<title data-rh="true">Poll | sealed.vote legacy</title>',
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
        expect(html).toContain(
            '<title data-rh="true">Create a poll | sealed.vote legacy</title>',
        );
        expect(html).toContain(
            'content="Legacy ElGamal research prototype for creating polls, collecting responses, and revealing results."',
        );
        expect(html).toContain(
            'content="https://deploy-preview-11--sealed-vote.netlify.app/"',
        );
        expect(html).not.toContain('href="https://elgamal.sealed.vote/"');
    });
});
